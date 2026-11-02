// The one place that decides whether a slot can take another booking, which seat it gets and
// which token number. Every channel books through here: the patient app (services/patient/booking.js)
// and the receptionist (services/receptionBooking.js). The database repeats the limits as triggers
// (migrations 010 and 014), so a booking that slips past this code is still refused.
//
// Channels:
//   online    - the patient app. Limited by the slot's capacity AND its online quota.
//   reception - booked at the front desk (walk-in or phone). Limited by the capacity alone, so it can
//               use the seats held back for walk-ins as well as any online seat still free.
// A slot's walk-in seats are capacity - online_quota (online_quota NULL means no seats held back).
//
// Emergency walk-ins: once every regular seat of a slot is booked, the front desk can add up to the
// block's emergency_seats (0-3) more patients to that exact slot. They sit on seats above the capacity,
// never use up a regular seat, and go to the front of the doctor's queue as E01, E02, ...

// Reception books two ways, both under the front desk's seat rules: at the desk ('Walk-in') or on the phone ('Phone').
const CHANNEL_SOURCE = { online: 'Gmedic App', reception: 'Walk-in', phone: 'Phone' };

// The schedule blocks in force for a doctor on a date (each version of a block has its own
// effective_from / effective_to range, so a capacity change never reaches back into booked days).
async function schedulesOn(runner, doctorId, date) {
  return runner.query(
    `SELECT * FROM doctor_schedules
     WHERE doctor_id = ? AND day_of_week = CAST(strftime('%w', ?) AS INTEGER)
       AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY start_time`,
    [doctorId, date, date, date]
  );
}

// A doctor marked "absent" is absent for the day they were marked (the hospital's date) and back by themselves
// after it, in every channel. Several days away are a leave (doctor_leaves). One rule for the front desk and the app.
const { dateInZone } = require('../utils/dates');
const db = require('../db');
// (Same rule in services/receptionBooking.js and services/patient/catalog.js.)
function absentOn(doctor, date, timezone) {
  if (doctor.availability !== 'absent') return false;
  return dateInZone(doctor.availability_updated_at || undefined, timezone) === date;
}

const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Every slot start time of a schedule block.
function slotTimes(block) {
  const out = [];
  for (let m = minutesOf(block.start_time); m + block.slot_minutes <= minutesOf(block.end_time); m += block.slot_minutes) out.push(hhmm(m));
  return out;
}

// The block whose slots include `time`, or null when the doctor has no slot starting then.
function blockFor(blocks, time) {
  return blocks.find((b) => slotTimes(b).includes(time)) || null;
}

const walkInSeatsOf = (block) => (block.online_quota == null ? 0 : Math.max(0, block.capacity_per_slot - block.online_quota));
const emergencySeatsOf = (block) => Number(block.emergency_seats) || 0;
const onlineQuotaOf = (block) => (block.online_quota == null ? block.capacity_per_slot : Math.min(block.online_quota, block.capacity_per_slot));

// Booked and held head counts per slot time on one day. Emergencies are counted on their own
// (`emergencyBooked`, `emergencySeatNos`): they sit above the capacity and never fill a regular seat. Live slot holds are online bookings
// mid-payment, so they count against the slot until they lapse. `ignoreHoldsOfUser` leaves out the asking
// patient's own holds (they already own that seat); `ignoreAppointmentId` leaves out the appointment
// being rescheduled.
async function slotLoad(runner, doctorId, date, { ignoreHoldsOfUser = '', ignoreAppointmentId = '' } = {}) {
  const load = new Map();
  const at = (time) => {
    if (!load.has(time)) load.set(time, { booked: 0, onlineBooked: 0, held: 0, seats: new Set(), emergencyBooked: 0, emergencySeatNos: new Set() });
    return load.get(time);
  };
  const appts = await runner.query(
    "SELECT appt_time, seat_no, source, is_emergency FROM appointments WHERE doctor_id = ? AND appt_date = ? AND status <> 'cancelled' AND id <> ?",
    [doctorId, date, ignoreAppointmentId]
  );
  for (const a of appts) {
    const s = at(a.appt_time);
    if (a.is_emergency) { s.emergencyBooked += 1; s.emergencySeatNos.add(a.seat_no); continue; }
    s.booked += 1;
    if (a.source === CHANNEL_SOURCE.online) s.onlineBooked += 1;
    s.seats.add(a.seat_no);
  }
  const holds = await runner.query(
    `SELECT h.appt_time, h.seat_no FROM slot_holds h LEFT JOIN patients p ON p.id = h.patient_id
     WHERE h.doctor_id = ? AND h.appt_date = ? AND h.status = 'HELD' AND h.held_until > datetime('now')
       AND COALESCE(p.account_user_id, '') <> ?`,
    [doctorId, date, ignoreHoldsOfUser]
  );
  for (const h of holds) {
    const s = at(h.appt_time);
    s.held += 1;
    s.seats.add(h.seat_no);
  }
  return load;
}

// What one slot can still take, per channel.
function seatsFor(block, slot) {
  const s = slot || { booked: 0, onlineBooked: 0, held: 0, emergencyBooked: 0 };
  const capacity = block.capacity_per_slot;
  const onlineQuota = onlineQuotaOf(block);
  const taken = s.booked + s.held;
  const totalLeft = Math.max(0, capacity - taken);
  const onlineLeft = Math.max(0, Math.min(totalLeft, onlineQuota - s.onlineBooked - s.held));
  return {
    capacity,
    walkInSeats: walkInSeatsOf(block),
    onlineQuota,
    booked: s.booked,
    held: s.held,
    seatsLeft: { online: onlineLeft, reception: totalLeft },
    emergency: { seats: emergencySeatsOf(block), booked: s.emergencyBooked, left: Math.max(0, emergencySeatsOf(block) - s.emergencyBooked) },
  };
}

// Inside a transaction: the lowest free seat number in the slot for this channel, or null when the
// channel can take no more. Head counts decide, not seat numbers, so seats booked before a capacity
// cut (seat 5 of a slot now capped at 3) never open room for extra bookings.
async function takeSeat(conn, { doctorId, date, time, channel, ignoreHoldsOfUser, ignoreAppointmentId }) {
  const block = blockFor(await schedulesOn(conn, doctorId, date), time);
  if (!block) return null;
  const load = await slotLoad(conn, doctorId, date, { ignoreHoldsOfUser, ignoreAppointmentId });
  const slot = load.get(time);
  if (seatsFor(block, slot).seatsLeft[channel] <= 0) return null;
  const used = slot ? slot.seats : new Set();
  for (let seat = 1; seat <= block.capacity_per_slot; seat += 1) if (!used.has(seat)) return { seat, block };
  return null;
}

// Inside a transaction: an emergency seat in a slot whose regular seats are all taken, or a reason it
// can't have one ({ refused }). Emergency seats are numbered capacity + 1 .. capacity + emergency_seats.
async function takeEmergencySeat(conn, { doctorId, date, time }) {
  const block = blockFor(await schedulesOn(conn, doctorId, date), time);
  if (!block) return { refused: 'no-slot' };
  const slot = (await slotLoad(conn, doctorId, date)).get(time);
  const seats = seatsFor(block, slot);
  if (seats.seatsLeft.reception > 0) return { refused: 'not-full', seatsLeft: seats.seatsLeft.reception };
  if (seats.emergency.seats === 0) return { refused: 'none-allowed' };
  if (seats.emergency.left <= 0) return { refused: 'emergency-full', seats: seats.emergency.seats };
  const used = slot ? slot.emergencySeatNos : new Set();
  for (let seat = block.capacity_per_slot + 1; seat <= block.capacity_per_slot + seats.emergency.seats; seat += 1) if (!used.has(seat)) return { seat, block };
  return { refused: 'emergency-full', seats: seats.emergency.seats };
}

// Inside a transaction: the next emergency number of the doctor's day (E01 is 1). Cancelled emergencies
// keep theirs, so a code is never handed out twice on a day.
async function nextEmergencyNo(conn, { doctorId, date }) {
  const row = await conn.one('SELECT MAX(emergency_no) AS n FROM appointments WHERE doctor_id = ? AND appt_date = ?', [doctorId, date]);
  return Number((row && row.n) || 0) + 1;
}

// Inside a transaction: the token number for a seat in a slot. Tokens follow the doctor's day in slot
// order: each slot owns as many numbers as it has seats, so with 6 patients per slot the 10:00 slot gets
// T001-T006 and the 11:00 slot T007-T012, and seat n of a slot gets that slot's n-th number, whichever
// channel booked it and in whatever order. A seat freed by a cancellation hands its number to the next
// booking of that seat.
// When that number is still held by another live booking or queue token (possible after the slot's
// capacity was cut for a day that already had bookings), the booking gets the next number after the
// day's planned capacity instead, so no two live tokens ever share a number.
async function slotTokenNumber(conn, { doctorId, date, time, seat, ignoreAppointmentId = '' }) {
  const blocks = await schedulesOn(conn, doctorId, date);
  let before = 0;
  let total = 0;
  let capacity = 0;
  for (const b of blocks) {
    for (const t of slotTimes(b)) {
      if (t < time) before += b.capacity_per_slot;
      if (t === time) capacity = b.capacity_per_slot;
      total += b.capacity_per_slot;
    }
  }
  // An emergency seat (above the capacity) owns no number in the plan: it takes one after the day's plan.
  const wanted = Number(seat || 1) <= capacity ? before + Number(seat || 1) : null;
  const taken = async (n) => !!(await conn.one(
    `SELECT 1 FROM appointments WHERE doctor_id = ? AND appt_date = ? AND token_no = ? AND status <> 'cancelled' AND id <> ?
     UNION ALL SELECT 1 FROM tokens WHERE doctor_id = ? AND token_date = ? AND number = ? AND status <> 'cancelled' AND appointment_id IS NOT ?`,
    [doctorId, date, n, ignoreAppointmentId, doctorId, date, n, ignoreAppointmentId || null]
  ));
  if (wanted && !(await taken(wanted))) return wanted;
  const row = await conn.one(
    `SELECT MAX(n) AS n FROM (
       SELECT token_no AS n FROM appointments WHERE doctor_id = ? AND appt_date = ? AND status <> 'cancelled'
       UNION ALL SELECT number FROM tokens WHERE doctor_id = ? AND token_date = ? AND status <> 'cancelled')`,
    [doctorId, date, doctorId, date]
  );
  return Math.max(total, Number((row && row.n) || 0)) + 1;
}

// Inside a transaction: the appointment's queue token, issued with the booking (no separate check-in step).
// It waits in the doctor's queue under the appointment's token number (an emergency shows its E code). Any earlier token rows of the
// appointment that are not in use are cleared first (a reschedule or a re-issue).
async function issueQueueToken(conn, { hospitalId, appointmentId, doctorId, date, number }) {
  await conn.query("DELETE FROM tokens WHERE appointment_id = ? AND status IN ('waiting', 'skipped', 'cancelled')", [appointmentId]);
  const appt = await conn.one('SELECT emergency_no FROM appointments WHERE id = ?', [appointmentId]);
  const code = appt && appt.emergency_no ? emergencyCode(appt.emergency_no) : tokenCode(number);
  const id = await db.nextId('tokens', 'TK', 10001, conn);
  await conn.query(
    `INSERT INTO tokens (id, hospital_id, appointment_id, doctor_id, token_date, number, code, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
    [id, hospitalId, appointmentId, doctorId, date, number, code]
  );
  return id;
}

// The token as every channel shows it: T001, T002, ... per doctor per day.
const tokenCode = (number) => `T${String(number).padStart(3, '0')}`;
const emergencyCode = (n) => `E${String(n).padStart(2, '0')}`;

// The order the doctor sees patients in: emergencies first (E01, E02, ...), then everyone else by token.
const queueOrder = (a, b) => (Number(!!b.emergency) - Number(!!a.emergency)) || (a.number - b.number);

// True for the errors the capacity, quota and seat triggers raise.
const isSlotFullError = (err) => /UNIQUE constraint failed: appointments|seat_no exceeds|quota|slot capacity is full|emergency seats for this slot are full/i.test(String(err && err.message));

// A doctor patients and the front desk can book: active, verified, and not tied to a deactivated
// branch. (`d.` is the doctors alias the caller uses.)
const BOOKABLE_DOCTOR = "d.status = 'ACTIVE' AND d.verification_status = 'VERIFIED' AND (d.branch_id IS NULL OR d.branch_id IN (SELECT id FROM hospital_branches WHERE status = 'ACTIVE'))";

module.exports = {
  BOOKABLE_DOCTOR, CHANNEL_SOURCE, absentOn, schedulesOn, slotTimes, blockFor, slotLoad, seatsFor, takeSeat, takeEmergencySeat, nextEmergencyNo,
  slotTokenNumber, issueQueueToken, tokenCode, emergencyCode, queueOrder, walkInSeatsOf, onlineQuotaOf, emergencySeatsOf, isSlotFullError,
};
