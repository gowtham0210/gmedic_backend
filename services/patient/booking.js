// Booking: seat holds, simulated payment, appointments, cancellation and rescheduling.
// Every booking writes the same appointments / payments / refunds tables the hospital portals read,
// then fires the notification events, so the doctor and receptionists see it straight away.

const crypto = require('crypto');
const db = require('../../db');
const events = require('../appointmentEvents');
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
    `SELECT * FROM appointments WHERE id = ? AND (booked_by_user_id = ? OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?))`,
    [id, me.user.id, me.user.id]
  );
  if (!a) throw notFound();
  const [p, d, h, pay, refund, token] = await Promise.all([
    db.one('SELECT * FROM patients WHERE id = ?', [a.patient_id]),
    db.one('SELECT * FROM doctors WHERE id = ?', [a.doctor_id]),
    db.one('SELECT * FROM hospitals WHERE id = ?', [a.hospital_id]),
    db.one("SELECT * FROM payments WHERE appointment_id = ? AND status = 'PAID' ORDER BY id DESC LIMIT 1", [a.id]),
    db.one("SELECT * FROM refunds WHERE appointment_id = ? AND status <> 'REJECTED' ORDER BY id DESC LIMIT 1", [a.id]),
    db.one("SELECT * FROM tokens WHERE appointment_id = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1", [a.id]),
  ]);
  const session = await db.one(
    'SELECT slot_minutes FROM doctor_schedules WHERE doctor_id = ? AND start_time <= ? AND end_time > ? ORDER BY day_of_week = ? DESC LIMIT 1',
    [a.doctor_id, a.appt_time, a.appt_time, new Date(`${a.appt_date}T00:00:00Z`).getUTCDay()]
  );
  const minutes = session ? session.slot_minutes : 15;
  const tz = h.timezone;
  const model = FEE_MODEL_OUT[h.booking_model] || 'fullPrepay';
  const consultation = paise(a.fee);
  const base = pay ? paise(pay.consultation_amount != null ? pay.consultation_amount : pay.amount) : 0;
  const conv = pay ? paise(pay.convenience_fee) : 0;
  const gst = pay ? paise(pay.tax_amount) : 0;
  const refundedRupees = pay ? Number((await db.one("SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE payment_id = ? AND status = 'COMPLETED'", [pay.id])).n) : 0;
  let queueAhead = null;
  if (token && ['waiting', 'called'].includes(token.status)) {
    queueAhead = Number((await db.one("SELECT COUNT(*) AS n FROM tokens WHERE doctor_id = ? AND token_date = ? AND status IN ('waiting','called','in_consultation') AND number < ?", [a.doctor_id, a.appt_date, token.number])).n);
  }
  const appointment = {
    id: a.id,
    code: `GM-${Number(a.id.replace(/\D/g, '') || 0).toString(36).toUpperCase().padStart(6, '0')}`,
    hospitalId: a.hospital_id,
    doctorId: a.doctor_id,
    patient: patientJson(p, me.user),
    start: isoAt(a.appt_date, a.appt_time, tz),
    end: isoAt(a.appt_date, hhmm(minutesOf(a.appt_time) + minutes), tz),
    token: a.token_no || (token ? token.number : 0),
    status: statusOf(a, token),
    fees: {
      model, consultationPaise: consultation, payNowBasePaise: base, convenienceFeePaise: conv, gstPaise: gst, totalNowPaise: base + conv + gst,
      payAtHospitalPaise: model === 'fullPrepay' ? 0 : model === 'bookingFee' ? Math.max(0, consultation - base) : consultation,
      payNowLabel: model === 'fullPrepay' ? 'Consultation fee' : model === 'bookingFee' ? 'Booking fee' : 'Token fee',
    },
    payment: pay ? {
      id: pay.id, gatewayRef: pay.gateway_order_id || pay.transaction_id, amountPaise: paise(pay.amount), method: METHOD_OUT[pay.method] || 'upi', paidAt: db.iso(pay.paid_at),
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
    `SELECT id FROM appointments WHERE booked_by_user_id = ? OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?) ORDER BY appt_date DESC, appt_time DESC`,
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

// Lowest seat number nobody holds or has booked on this slot (null when the slot is full).
async function freeSeat(conn, d, date, time, capacity, { ignoreAppointmentId } = {}) {
  const used = new Set();
  for (const r of await conn.query("SELECT seat_no FROM appointments WHERE doctor_id = ? AND appt_date = ? AND appt_time = ? AND status <> 'cancelled' AND id <> ?", [d.id, date, time, ignoreAppointmentId || ''])) used.add(r.seat_no);
  for (const r of await conn.query("SELECT seat_no FROM slot_holds WHERE doctor_id = ? AND appt_date = ? AND appt_time = ? AND status = 'HELD' AND held_until > datetime('now')", [d.id, date, time])) used.add(r.seat_no);
  for (let seat = 1; seat <= capacity; seat += 1) if (!used.has(seat)) return seat;
  return null;
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
    const seat = await freeSeat(conn, d, date, time, slot.capacity);
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
  const msg = String(err && err.message);
  if (/UNIQUE constraint failed: appointments|seat_no exceeds|quota/i.test(msg)) return slotGone();
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
  const { d, h, date, time, slot } = await catalog.resolveSlot(me, `${hold.doctor_id}_${hold.appt_date.replace(/-/g, '')}${hold.appt_time.replace(':', '')}`);

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
        seat = await freeSeat(conn, d, date, time, slot.capacity);
        if (!seat) return { lateRefund: true };
      }
      await duplicateCheck(patient, d, date);
      const apptId = await db.nextId('appointments', 'APT', 10001, conn);
      const tokenNo = Number((await conn.one('SELECT COALESCE(MAX(token_no), 0) + 1 AS n FROM appointments WHERE doctor_id = ? AND appt_date = ?', [d.id, date])).n);
      await conn.query("UPDATE slot_holds SET status = 'CONVERTED', appointment_id = NULL WHERE id = ?", [hold.id]);
      await conn.query(
        `INSERT INTO appointments (id, hospital_id, doctor_id, patient_id, appt_date, appt_time, seat_no, fee, currency, status, payment_status, source, token_no, reason_for_visit, booked_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'confirmed', 'pending', 'Gmedic App', ?, ?, ?)`,
        [apptId, h.id, d.id, patient.id, date, time, seat, d.fee, tokenNo, reasonText, me.user.id]
      );
      const payId = await db.nextId('payments', 'PAY', 20001, conn);
      const txn = `TXN${crypto.randomInt(1e9, 1e10)}`;
      await conn.query(
        `INSERT INTO payments (id, appointment_id, consultation_amount, convenience_fee, tax_amount, amount, currency, method, gateway, gateway_order_id, transaction_id, status, paid_at, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, 'INR', ?, 'SIMULATED', ?, ?, 'PAID', datetime('now'), ?)`,
        [payId, apptId, rupees(fees.payNowBasePaise), rupees(fees.convenienceFeePaise), rupees(fees.gstPaise), rupees(fees.totalNowPaise), dbMethod, `order_${crypto.randomBytes(6).toString('hex')}`, txn, key]
      );
      await conn.query('UPDATE slot_holds SET appointment_id = ? WHERE id = ?', [apptId, hold.id]);
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
async function refundQuoteFor(v) {
  const a = v.appointment;
  const rules = await hoursOf(v.hospital.id);
  const paid = a.payment ? a.payment.amountPaise : 0;
  const early = Date.now() <= new Date(a.start).getTime() - rules.cancellationWindowHours * 3600000;
  if (a.fees.model === 'tokenFee') return { refundPaise: 0, paidPaise: paid, withinFreeWindow: early, note: 'The token fee is non-refundable.' };
  if (early) {
    return {
      refundPaise: Math.floor((a.fees.payNowBasePaise * rules.refundPercent) / 100), paidPaise: paid, withinFreeWindow: true,
      note: `${rules.refundPercent === 100 ? 'Full' : `${rules.refundPercent}% of the`} ${a.fees.payNowLabel.toLowerCase()} refunded. The convenience fee and GST are non-refundable.`,
    };
  }
  return { refundPaise: 0, paidPaise: paid, withinFreeWindow: false, note: `Cancellations less than ${rules.cancellationWindowHours} hours before the slot are not refunded.` };
}

async function cancelQuote(me, id) {
  const v = await view(me, id);
  if (v.appointment.status !== 'confirmed') throw policy('Only confirmed appointments can be cancelled.');
  return refundQuoteFor(v);
}

async function cancelWith(me, id, reason) {
  const v = await view(me, id);
  if (v.appointment.status !== 'confirmed') throw policy('Only confirmed appointments can be cancelled.');
  const quote = await refundQuoteFor(v);
  const text = String(reason || '').trim().slice(0, 300) || null;
  await db.tx(async (conn) => {
    await conn.query("UPDATE appointments SET status = 'cancelled', cancel_reason = ?, cancelled_by = ? WHERE id = ?", [text, me.user.id, id]);
    await conn.query("UPDATE slot_holds SET status = 'RELEASED' WHERE appointment_id = ? AND status = 'HELD'", [id]);
    if (quote.refundPaise > 0 && v.appointment.payment) {
      const refundId = await db.nextId('refunds', 'REF', 1, conn);
      // No live gateway is connected: like the admin approval flow, the payout is simulated as completed at once.
      await conn.query(
        `INSERT INTO refunds (id, payment_id, appointment_id, amount, currency, reason, status, requested_by, approved_at, completed_at)
         VALUES (?, ?, ?, ?, 'INR', 'Cancelled by patient', 'COMPLETED', ?, datetime('now'), datetime('now'))`,
        [refundId, v.appointment.payment.id, id, rupees(quote.refundPaise), me.user.id]
      );
    }
  });
  return id;
}

async function cancel(me, id, reason) {
  await cancelWith(me, id, reason);
  await fireEvents(['APPOINTMENT_CANCELLED'], id);
  return appointment(me, id);
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
      const seat = await freeSeat(conn, d, date, time, slot.capacity, { ignoreAppointmentId: id });
      if (!seat) throw slotGone();
      const tokenNo = Number((await conn.one('SELECT COALESCE(MAX(token_no), 0) + 1 AS n FROM appointments WHERE doctor_id = ? AND appt_date = ?', [d.id, date])).n);
      await conn.query(
        `UPDATE appointments SET appt_date = ?, appt_time = ?, seat_no = ?, token_no = ?, reschedule_count = reschedule_count + 1,
           rescheduled_from_date = ?, rescheduled_from_time = ? WHERE id = ?`,
        [date, time, seat, tokenNo, row.appt_date, row.appt_time, id]
      );
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

module.exports = { holdSlot, releaseHold, pay, appointments, appointment, cancelQuote, cancel, rescheduleCheck, reschedule, deleteAccount, toSqlUtc, isDate };
