// Booking: seat holds, simulated payment, appointments, cancellation and rescheduling.
// Every booking writes the same appointments / payments / refunds tables the hospital portals read,
// then fires the notification events, so the doctor and receptionists see it straight away.

const crypto = require('crypto');
const db = require('../../db');
const featureFlags = require('../featureFlags');
const events = require('../appointmentEvents');
const bookingCore = require('../bookingCore');
const {
  fail, notFound, policy, RULES, nowIn, isoAt, instant, minutesOf, hhmm, isDate,
  paise, rupees, METHOD_IN, METHOD_OUT, patientJson, hospitalJson, hoursOf, holdMinutes, feeBreakdown, FEE_MODEL_OUT,
} = require('./common');
const catalog = require('./catalog');
const account = require('./account');

const SIMULATE = () => (process.env.NODE_ENV !== 'production' || process.env.PATIENT_OTP_MODE === 'dev');

async function ownPatient(me, patientId) {
  const self = await account.selfPatient(me.user.id);
  if (String(patientId) === me.user.id || (self && String(patientId) === self.id)) return self;
  const row = await db.one('SELECT * FROM patients WHERE id = ? AND account_user_id = ?', [patientId, me.user.id]);
  if (!row) throw notFound();
  return row;
}

function toSqlUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

async function fireEvents(keys, appointmentId) {
  for (const key of keys) {
    try { await events.fire(key, appointmentId); } catch (err) { console.error(`notification ${key} failed`, err.message); }
  }
}

// ----------------------------------------------------------------------------- appointment JSON
function statusOf(a, token) {
  if (a.status === 'cancelled') return 'cancelled';
  if (a.no_show) return 'noShow';
  if (a.status === 'completed') return 'completed';
  if (token) {
    if (token.status === 'in_consultation') return 'inConsultation';
    if (token.status === 'completed') return 'completed';
    if (['waiting', 'called', 'skipped'].includes(token.status)) return 'checkedIn';
  }
  return 'confirmed';
}

async function view(me, id) {
  const a = await db.one(
    `SELECT * FROM appointments WHERE id = ? AND emergency_walkin = 0 AND (booked_by_user_id = ? OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?))`,
    [id, me.user.id, me.user.id]
  );
  if (!a) throw notFound();
  return buildView(a, me.user);
}

// The same view for hospital staff (no patient ownership check). Null when it isn't this hospital's.
async function hospitalView(hospitalId, id) {
  const a = await db.one('SELECT * FROM appointments WHERE id = ? AND hospital_id = ?', [id, hospitalId]);
  return a ? buildView(a, null) : null;
}

async function buildView(a, user) {
  const [p, d, h, pay, refund, token] = await Promise.all([
    db.one('SELECT * FROM patients WHERE id = ?', [a.patient_id]),
    db.one('SELECT * FROM doctors WHERE id = ?', [a.doctor_id]),
    db.one('SELECT * FROM hospitals WHERE id = ?', [a.hospital_id]),
    // The booking token paid in the app (the consultation fee is paid at the hospital, see consultationPaid).
    db.one("SELECT * FROM payments WHERE appointment_id = ? AND status = 'PAID' AND purpose = 'TOKEN' ORDER BY id DESC LIMIT 1", [a.id]),
    db.one("SELECT * FROM refunds WHERE appointment_id = ? AND status <> 'REJECTED' ORDER BY id DESC LIMIT 1", [a.id]),
    db.one("SELECT * FROM tokens WHERE appointment_id = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1", [a.id]),
  ]);
  const session = await db.one(
    'SELECT slot_minutes FROM doctor_schedules WHERE doctor_id = ? AND start_time <= ? AND end_time > ? ORDER BY day_of_week = ? DESC LIMIT 1',
    [a.doctor_id, a.appt_time, a.appt_time, new Date(`${a.appt_date}T00:00:00Z`).getUTCDay()]
  );
  const minutes = session ? session.slot_minutes : 15;
  const tz = h.timezone;
  const consultation = paise(a.fee);
  const base = pay ? paise(pay.amount) : 0;
  const refundedRupees = pay ? Number((await db.one("SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE payment_id = ? AND status = 'COMPLETED'", [pay.id])).n) : 0;
  let queueAhead = null;
  // The live queue position is the "live_queue" feature flag (Platform Settings > Feature Flags).
  if (token && ['waiting', 'called'].includes(token.status) && await featureFlags.isEnabled('live_queue', a.hospital_id)) {
    queueAhead = Number((await db.one("SELECT COUNT(*) AS n FROM tokens WHERE doctor_id = ? AND token_date = ? AND status IN ('waiting','called','in_consultation') AND number < ?", [a.doctor_id, a.appt_date, token.number])).n);
  }
  const appointment = {
    id: a.id,
    code: `GM-${Number(a.id.replace(/\D/g, '') || 0).toString(36).toUpperCase().padStart(6, '0')}`,
    hospitalId: a.hospital_id,
    doctorId: a.doctor_id,
    patient: patientJson(p, user),
    start: isoAt(a.appt_date, a.appt_time, tz),
    end: isoAt(a.appt_date, hhmm(minutesOf(a.appt_time) + minutes), tz),
    token: a.token_no || (token ? token.number : 0),
    status: statusOf(a, token),
    fees: {
      model: 'tokenFee', consultationPaise: consultation, payNowBasePaise: base, convenienceFeePaise: 0, gstPaise: 0, totalNowPaise: base,
      payAtHospitalPaise: consultation, payNowLabel: 'Booking token',
    },
    // The consultation fee has been paid at the hospital (front desk).
    consultationPaid: a.payment_status === 'paid',
    payment: pay ? {
      id: pay.id, gateway: pay.gateway, gatewayRef: pay.gateway_order_id || pay.transaction_id, amountPaise: paise(pay.amount), method: METHOD_OUT[pay.method] || 'upi', paidAt: db.iso(pay.paid_at),
      status: refundedRupees <= 0 ? 'paid' : refundedRupees >= Number(pay.amount) ? 'refunded' : 'partiallyRefunded',
    } : null,
    createdAt: db.iso(a.created_at),
    reason: a.reason_for_visit || null,
    refund: refund ? { amountPaise: paise(refund.amount), status: refund.status === 'COMPLETED' ? 'completed' : 'initiated', createdAt: db.iso(refund.created_at), reason: refund.reason } : null,
    rescheduleCount: a.reschedule_count,
    queueAhead,
    cancelledAt: db.iso(a.cancelled_at),
    cancelReason: a.cancel_reason || null,
    checkedInAt: token ? db.iso(token.created_at) : null,
  };
  return { appointment, hospital: hospitalJson(h), doctor: await catalog.doctorJson(d, h), _row: a };
}

const publicView = ({ appointment, hospital, doctor }) => ({ appointment, hospital, doctor });

async function appointments(me) {
  const rows = await db.query(
    `SELECT id FROM appointments WHERE emergency_walkin = 0 AND (booked_by_user_id = ? OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)) ORDER BY appt_date DESC, appt_time DESC`,
    [me.user.id, me.user.id]
  );
  const out = [];
  for (const r of rows) out.push(publicView(await view(me, r.id)));
  return out;
}

async function appointment(me, id) {
  return publicView(await view(me, id));
}

// ----------------------------------------------------------------------------- holds
async function duplicateCheck(patient, d, date, ignoreId) {
  const clash = await db.one(
    "SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? AND appt_date = ? AND status IN ('confirmed','pending') AND id <> ?",
    [patient.id, d.id, date, ignoreId || '']
  );
  if (clash) {
    const who = patient.relation === 'SELF' ? 'You already have' : `${patient.name} already has`;
    throw fail(409, 'DUPLICATE_BOOKING', `${who} an appointment with ${d.name} that day. Pick another day.`);
  }
}

// Lowest free seat for an online booking (null when the slot, or its online quota, is full).
async function freeSeat(conn, d, date, time, { ignoreAppointmentId } = {}) {
  const taken = await bookingCore.takeSeat(conn, { doctorId: d.id, date, time, channel: 'online', ignoreAppointmentId });
  return taken ? taken.seat : null;
}

const slotGone = () => fail(409, 'SLOT_UNAVAILABLE', 'Someone just booked this slot. Please pick another time.');

async function holdSlot(me, slotIdValue, patientId) {
  const patient = await ownPatient(me, patientId);
  const { d, h, date, time, slot } = await catalog.resolveSlot(me, slotIdValue);
  await catalog.requireLinked(me, h.id);
  if (h.status !== 'ACTIVE') throw policy('This hospital is not accepting bookings right now.');
  await duplicateCheck(patient, d, date);
  const minutes = await holdMinutes();
  const hold = await db.tx(async (conn) => {
    // lapsed holds free their seat (the unique index allows one live hold per seat)
    await conn.query("UPDATE slot_holds SET status = 'EXPIRED' WHERE status = 'HELD' AND held_until <= datetime('now')");
    await conn.query("UPDATE slot_holds SET status = 'RELEASED' WHERE status = 'HELD' AND patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)", [me.user.id]);
    if (slot.status === 'unavailable') throw slotGone();
    const seat = await freeSeat(conn, d, date, time);
    if (!seat) throw slotGone();
    const res = await conn.query(
      "INSERT INTO slot_holds (doctor_id, appt_date, appt_time, patient_id, held_until, status, seat_no) VALUES (?, ?, ?, ?, datetime('now', ?), 'HELD', ?)",
      [d.id, date, time, patient.id, `+${minutes} minutes`, seat]
    );
    return conn.one('SELECT * FROM slot_holds WHERE id = ?', [res.insertId]);
  });
  return {
    id: String(hold.id),
    slot: { id: slot.id, doctorId: d.id, start: slot.start, end: slot.end, status: 'available', seatsLeft: Math.max(0, slot.seatsLeft), capacity: slot.capacity },
    patientId: String(patientId),
    expiresAt: db.iso(hold.held_until),
    ttlSeconds: minutes * 60,
  };
}

async function releaseHold(me, holdId) {
  await db.query(
    "UPDATE slot_holds SET status = 'RELEASED' WHERE id = ? AND status = 'HELD' AND patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)",
    [Number(holdId) || 0, me.user.id]
  );
}

// ----------------------------------------------------------------------------- pay (simulated gateway)
function mapDbError(err) {
  if (bookingCore.isSlotFullError(err)) return slotGone();
  return err;
}

async function pay(me, holdId, { method, idempotencyKey, reason, simulate } = {}) {
  const key = String(idempotencyKey || '').trim();
  if (key.length < 8 || key.length > 80) throw fail(400, 'VALIDATION', 'An idempotency key (8-80 characters) is required.');
  const dbMethod = METHOD_IN[method];
  if (!dbMethod) throw fail(400, 'VALIDATION', 'Choose UPI, card, net banking or wallet.');

  const prior = await db.one('SELECT appointment_id FROM payments WHERE idempotency_key = ?', [key]);
  if (prior) return appointment(me, prior.appointment_id); // the same key never charges twice

  const hold = await db.one(
    "SELECT * FROM slot_holds WHERE id = ? AND patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)",
    [Number(holdId) || 0, me.user.id]
  );
  if (!hold || !['HELD', 'EXPIRED'].includes(hold.status)) throw fail(410, 'HOLD_EXPIRED', 'Your slot hold expired. Please pick a time again.');
  const patient = await db.one('SELECT * FROM patients WHERE id = ?', [hold.patient_id]);
  const { d, h, date, time } = await catalog.resolveSlot(me, `${hold.doctor_id}_${hold.appt_date.replace(/-/g, '')}${hold.appt_time.replace(':', '')}`);

  if (SIMULATE() && simulate === 'decline') throw fail(402, 'PAYMENT_DECLINED', 'Your bank declined the payment. No money was deducted.');
  if (SIMULATE() && simulate === 'timeout') throw fail(402, 'PAYMENT_TIMEOUT', 'We couldn\'t confirm your payment with the bank. If money was deducted, it will be refunded automatically in 5-7 working days.');

  const fees = await feeBreakdown(d, h);
  const reasonText = String(reason || '').trim().slice(0, 300) || null;
  let result;
  try {
    result = await db.tx(async (conn) => {
      const live = await conn.one('SELECT * FROM slot_holds WHERE id = ?', [hold.id]);
      const stillMine = live.status === 'HELD' && live.held_until > toSqlUtc(Date.now());
      let seat = live.seat_no;
      if (!stillMine) {
        // BK-06: payment arrived after the hold lapsed - confirm only if a seat is still free.
        await conn.query("UPDATE slot_holds SET status = 'EXPIRED' WHERE id = ? AND status = 'HELD'", [hold.id]);
        seat = await freeSeat(conn, d, date, time);
        if (!seat) return { lateRefund: true };
      }
      await duplicateCheck(patient, d, date);
      const apptId = await db.nextId('appointments', 'APT', 10001, conn);
      const tokenNo = await bookingCore.slotTokenNumber(conn, { doctorId: d.id, date, time, seat });
      await conn.query("UPDATE slot_holds SET status = 'CONVERTED', appointment_id = NULL WHERE id = ?", [hold.id]);
      await conn.query(
        `INSERT INTO appointments (id, hospital_id, doctor_id, patient_id, appt_date, appt_time, seat_no, fee, currency, status, payment_status, source, token_no, reason_for_visit, booked_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'confirmed', 'pending', 'Gmedic App', ?, ?, ?)`,
        [apptId, h.id, d.id, patient.id, date, time, seat, d.fee, tokenNo, reasonText, me.user.id]
      );
      const payId = await db.nextId('payments', 'PAY', 20001, conn);
      const txn = `TXN${crypto.randomInt(1e9, 1e10)}`;
      await conn.query(
        // The booking token: Gmedic's, never refunded, and it doesn't make the appointment "paid" (the
        // consultation fee is paid at the hospital).
        `INSERT INTO payments (id, appointment_id, purpose, consultation_amount, convenience_fee, tax_amount, amount, currency, method, gateway, gateway_order_id, transaction_id, status, paid_at, idempotency_key)
         VALUES (?, ?, 'TOKEN', NULL, 0, 0, ?, 'INR', ?, 'SIMULATED', ?, ?, 'PAID', datetime('now'), ?)`,
        [payId, apptId, rupees(fees.totalNowPaise), dbMethod, `order_${crypto.randomBytes(6).toString('hex')}`, txn, key]
      );
      await conn.query('UPDATE slot_holds SET appointment_id = ? WHERE id = ?', [apptId, hold.id]);
      // The queue token comes with the booking (no check-in step at the desk).
      await bookingCore.issueQueueToken(conn, { hospitalId: h.id, appointmentId: apptId, doctorId: d.id, date, number: tokenNo });
      return { apptId };
    });
  } catch (err) {
    throw mapDbError(err);
  }
  if (result.lateRefund) throw fail(402, 'PAYMENT_LATE_REFUNDED', 'Your hold expired and the slot was taken. The full amount will be refunded automatically.');
  await fireEvents(['NEW_APPOINTMENT', 'APPOINTMENT_CONFIRMED', 'PAYMENT_SUCCESS'], result.apptId);
  return appointment(me, result.apptId);
}

// ----------------------------------------------------------------------------- cancel / reschedule
// What cancelling gives back: nothing from Gmedic. The booking token is never refunded, whoever cancels;
// a consultation fee already paid at the hospital is returned by the hospital itself (no refund record).
async function refundQuoteFor(v) {
  const a = v.appointment;
  const rules = await hoursOf(v.hospital.id);
  const paid = a.payment ? a.payment.amountPaise : 0;
  const early = Date.now() <= new Date(a.start).getTime() - rules.cancellationWindowHours * 3600000;
  const note = a.consultationPaid
    ? 'The booking token is non-refundable. The consultation fee was paid at the hospital, so the hospital returns it.'
    : 'The booking token is non-refundable.';
  return { paidPaise: paid, alreadyRefundedPaise: 0, withinFreeWindow: early, refundPaise: 0, note };
}

async function cancelQuote(me, id) {
  const v = await view(me, id);
  if (v.appointment.status !== 'confirmed') throw policy('Only confirmed appointments can be cancelled.');
  return refundQuoteFor(v);
}

// One cancellation for every channel (patient app, front desk): stores the reason, frees the seat and
// refunds by the hospital's rules. The live queue token is withdrawn by trg_sync_appt_cancelled
// (database/migrations/015_token_appointment_sync.sql), so the doctor can't call the patient.
// Returns the refund quote that was applied. Callers check who may cancel first.
async function cancelWith(v, { reason, byUserId, refundReason }) {
  const id = v.appointment.id;
  const quote = await refundQuoteFor(v); // always ₹0: the booking token is never refunded
  const text = String(reason || '').trim().slice(0, 300) || null;
  await db.tx(async (conn) => {
    // Guarded so a double submit can't cancel (and refund) twice.
    const res = await conn.query("UPDATE appointments SET status = 'cancelled', cancel_reason = ?, cancelled_by = ? WHERE id = ? AND status <> 'cancelled'", [text, byUserId, id]);
    if (!res.affectedRows) throw policy('This appointment is already cancelled.');
    await conn.query("UPDATE slot_holds SET status = 'RELEASED' WHERE appointment_id = ? AND status = 'HELD'", [id]);
    if (quote.refundPaise > 0 && v.appointment.payment) {
      const refundId = await db.nextId('refunds', 'REF', 1, conn);
      // No live gateway is connected: like the admin approval flow, the payout is simulated as completed at once.
      await conn.query(
        `INSERT INTO refunds (id, payment_id, appointment_id, amount, currency, reason, status, requested_by, approved_at, completed_at)
         VALUES (?, ?, ?, ?, 'INR', ?, 'COMPLETED', ?, datetime('now'), datetime('now'))`,
        [refundId, v.appointment.payment.id, id, rupees(quote.refundPaise), refundReason, byUserId]
      );
    }
  });
  await fireEvents(['APPOINTMENT_CANCELLED'], id);
  return quote;
}

async function cancel(me, id, reason) {
  const v = await view(me, id);
  if (v.appointment.status !== 'confirmed') throw policy('Only confirmed appointments can be cancelled.');
  await cancelWith(v, { reason, byUserId: me.user.id, refundReason: 'Cancelled by patient' });
  return appointment(me, id);
}

// ----------------------------------------------------------------------------- front-desk cancel
// Reception may also cancel a checked-in patient who leaves, but not once the consultation has started.
function deskCancelBlocker(v) {
  const s = v.appointment.status;
  if (s === 'cancelled') return 'This appointment is already cancelled.';
  if (s === 'completed') return 'A completed appointment cannot be cancelled.';
  if (s === 'inConsultation') return 'The patient is with the doctor now, so this appointment cannot be cancelled.';
  if (s === 'noShow') return 'This appointment is marked as a no-show. Undo the no-show first if you need to cancel it.';
  return null;
}

async function deskCancelQuote(hospitalId, id) {
  const v = await hospitalView(hospitalId, id);
  if (!v) return null;
  return { blocker: deskCancelBlocker(v), ...(await refundQuoteFor(v)) };
}

async function deskCancel(hospitalId, id, reason, byUserId) {
  const v = await hospitalView(hospitalId, id);
  if (!v) return null;
  const blocker = deskCancelBlocker(v);
  if (blocker) throw policy(blocker);
  return cancelWith(v, { reason, byUserId, refundReason: 'Cancelled at the front desk' });
}

// ----------------------------------------------------------------------------- admin escalation cancel
// Super Admin can cancel any appointment nobody else can handle (hospital offboarded, doctor rejected).
// Same rules as the front desk (nothing completed, cancelled or in consultation), same cancel path.
async function adminView(id) {
  const a = await db.one('SELECT * FROM appointments WHERE id = ?', [id]);
  return a ? buildView(a, null) : null;
}

async function adminCancelQuote(id) {
  const v = await adminView(id);
  if (!v) return null;
  const policyQuote = await refundQuoteFor(v);
  return { blocker: deskCancelBlocker(v), ...policyQuote, fullRefundPaise: 0, hospitalName: v.hospital.name };
}

async function adminCancel(id, reason, byUserId) {
  const v = await adminView(id);
  if (!v) return null;
  const blocker = deskCancelBlocker(v);
  if (blocker) throw policy(blocker);
  return cancelWith(v, { reason, byUserId, refundReason: 'Cancelled by Gmedic admin' });
}

// ----------------------------------------------------------------------------- doctor cancel
// The doctor of the appointment cancels it (they can't see the patient). Same blockers and the same cancel
// path as the front desk; the booking token is not refunded.
async function doctorView(doctorId, id) {
  const a = await db.one('SELECT * FROM appointments WHERE id = ? AND doctor_id = ?', [id, doctorId]);
  return a ? buildView(a, null) : null;
}

// A day that has passed can't be cancelled (and refunded) by the doctor: a patient who never came is closed out
// by the front desk instead, so a no-show is not refunded days later.
async function doctorPastBlocker(v) {
  const a = v.appointment;
  const row = await db.one('SELECT a.appt_date, h.timezone FROM appointments a JOIN hospitals h ON h.id = a.hospital_id WHERE a.id = ?', [a.id]);
  if (row && row.appt_date < require('../../models/appointmentModel').todayIn(row.timezone)) return 'This appointment was on an earlier day, so it can no longer be cancelled. Ask the front desk if it needs to be closed.';
  return null;
}

async function doctorCancelQuote(doctorId, id) {
  const v = await doctorView(doctorId, id);
  if (!v) return null;
  return { blocker: deskCancelBlocker(v) || await doctorPastBlocker(v), ...(await refundQuoteFor(v)) };
}

async function doctorCancel(doctorId, id, reason, byUserId) {
  const v = await doctorView(doctorId, id);
  if (!v) return null;
  const blocker = deskCancelBlocker(v) || await doctorPastBlocker(v);
  if (blocker) throw policy(blocker);
  return cancelWith(v, { reason, byUserId, refundReason: 'Cancelled by the doctor' });
}

function rescheduleBlocker(v) {
  const a = v.appointment;
  if (a.status !== 'confirmed') return 'Only confirmed appointments can be rescheduled.';
  if (a.rescheduleCount >= 1) return 'You have already rescheduled this appointment once.';
  if (Date.now() > new Date(a.start).getTime() - RULES.rescheduleWindowHours * 3600000) return `Rescheduling closes ${RULES.rescheduleWindowHours} hours before your slot.`;
  return null;
}

async function rescheduleCheck(me, id) {
  return { blocker: rescheduleBlocker(await view(me, id)) };
}

async function reschedule(me, id, slotIdValue) {
  const v = await view(me, id);
  const blocker = rescheduleBlocker(v);
  if (blocker) throw policy(blocker);
  const { d, date, time, slot } = await catalog.resolveSlot(me, slotIdValue);
  const row = v._row;
  if (d.id !== row.doctor_id) throw policy('You can only reschedule with the same doctor.');
  if (date === row.appt_date && time === row.appt_time) throw policy('Pick a different time.');
  const patient = await db.one('SELECT * FROM patients WHERE id = ?', [row.patient_id]);
  await duplicateCheck(patient, d, date, id);
  try {
    await db.tx(async (conn) => {
      if (slot.status === 'unavailable') throw slotGone();
      const seat = await freeSeat(conn, d, date, time, { ignoreAppointmentId: id });
      if (!seat) throw slotGone();
      const live = await conn.one("SELECT status FROM tokens WHERE appointment_id = ? AND status IN ('called', 'in_consultation')", [id]);
      if (live) throw policy('You have already been called by the doctor, so this appointment can no longer be moved.');
      // Its tokens are tied to the appointment's day by a foreign key, so they go before the day changes.
      await conn.query("DELETE FROM tokens WHERE appointment_id = ? AND status IN ('waiting', 'skipped', 'cancelled')", [id]);
      const tokenNo = await bookingCore.slotTokenNumber(conn, { doctorId: d.id, date, time, seat, ignoreAppointmentId: id });
      await conn.query(
        `UPDATE appointments SET appt_date = ?, appt_time = ?, seat_no = ?, token_no = ?, reschedule_count = reschedule_count + 1,
           rescheduled_from_date = ?, rescheduled_from_time = ? WHERE id = ?`,
        [date, time, seat, tokenNo, row.appt_date, row.appt_time, id]
      );
      await bookingCore.issueQueueToken(conn, { hospitalId: row.hospital_id, appointmentId: id, doctorId: d.id, date, number: tokenNo });
    });
  } catch (err) {
    throw mapDbError(err);
  }
  await fireEvents(['APPOINTMENT_RESCHEDULED'], id);
  return appointment(me, id);
}

// ----------------------------------------------------------------------------- delete account
async function deleteAccount(me) {
  const open = await db.query(
    "SELECT id FROM appointments WHERE booked_by_user_id = ? AND status = 'confirmed' AND appt_date >= ?",
    [me.user.id, new Date().toISOString().slice(0, 10)]
  );
  for (const a of open) {
    try { await cancel(me, a.id, 'Account deleted'); } catch (err) { /* a visit already under way stays on record */ }
  }
  await db.tx(async (conn) => {
    await conn.query("UPDATE slot_holds SET status = 'RELEASED' WHERE status = 'HELD' AND patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)", [me.user.id]);
    // Hospitals keep the visit and payment records, but the personal details are removed.
    await conn.query("UPDATE patients SET name = 'Deleted patient', mobile = NULL, email = NULL, date_of_birth = NULL, gender = NULL, city = NULL, account_user_id = NULL WHERE account_user_id = ?", [me.user.id]);
    await conn.query("UPDATE patient_hospital_links SET removed_at = COALESCE(removed_at, datetime('now')), account_user_id = NULL WHERE account_user_id = ?", [me.user.id]);
    await conn.query("UPDATE users SET status = 'INACTIVE', name = 'Deleted patient', phone = NULL, email = id || '@deleted.gmedic.local', username = id, session_version = session_version + 1 WHERE id = ?", [me.user.id]);
    await conn.query('DELETE FROM sessions WHERE user_id = ?', [me.user.id]);
    await conn.query('DELETE FROM notifications WHERE user_id = ?', [me.user.id]);
  });
}

module.exports = { holdSlot, releaseHold, pay, appointments, appointment, cancelQuote, cancel, deskCancelQuote, deskCancel, adminCancelQuote, adminCancel, doctorCancelQuote, doctorCancel, rescheduleCheck, reschedule, deleteAccount, toSqlUtc, isDate };
