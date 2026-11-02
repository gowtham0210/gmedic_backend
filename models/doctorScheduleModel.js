// A doctor's weekly working hours. Each row is one time block; a day with a
// lunch break (e.g. 09:00-13:00 and 16:00-19:00) is simply two rows for the
// same day_of_week — no separate break columns needed.
//
// Changes never reach back into days already open for booking: adding, editing or removing a
// block takes effect from the next working day (tomorrow in the hospital's time zone). An edit
// closes the version in force today (effective_to = today) and starts a new version tomorrow, so
// today's slots keep the capacity patients booked against. Appointments are never moved or
// cancelled by a schedule change; a slot left over its new capacity just takes no new bookings.

const db = require('../db');
const bookingCore = require('../services/bookingCore');
const { nowIn, addDays } = require('../services/patient/common');

function fromRow(row) {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    slotMinutes: row.slot_minutes,
    capacityPerSlot: row.capacity_per_slot,
    walkInSeats: bookingCore.walkInSeatsOf(row),
    effectiveFrom: row.effective_from || null,
    effectiveTo: row.effective_to || null,
  };
}

// fromRow plus where the block stands relative to today, so a screen can say "Ends today" /
// "Starts <date>" and stop offering changes to a block that is already ending.
function withState(row, today) {
  const b = fromRow(row);
  return { ...b, endsToday: !!(row.effective_to && row.effective_to <= today), startsLater: !!(row.effective_from && row.effective_from > today) };
}

// Today and the next working day, in the doctor's hospital time zone.
async function daysFor(doctorId) {
  const h = await db.one('SELECT h.timezone FROM doctors d JOIN hospitals h ON h.id = d.hospital_id WHERE d.id = ?', [doctorId]);
  const today = nowIn(h ? h.timezone : undefined).date;
  return { today, tomorrow: addDays(today, 1) };
}

// The first date on or after `from` that falls on the block's weekday.
function firstDateOn(dayOfWeek, from) {
  let date = from;
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== dayOfWeek) date = addDays(date, 1);
  return date;
}

// Blocks in force today or later; versions that ended before today are history.
async function list(doctorId) {
  const { today } = await daysFor(doctorId);
  const rows = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND (effective_to IS NULL OR effective_to >= ?) ORDER BY day_of_week, start_time, effective_from',
    [doctorId, today]
  );
  return rows.map((r) => withState(r, today));
}

// Upcoming bookings (from tomorrow on) inside a block's hours: what removing it, or moving its hours,
// leaves outside the schedule. They are always kept; this is what the doctor is told before confirming.
async function bookingsIn(row, from, { outside = null } = {}) {
  const rows = await db.query(
    `SELECT appt_date, appt_time FROM appointments
     WHERE doctor_id = ? AND appt_date >= ? AND status IN ('confirmed', 'pending') AND no_show = 0
       AND CAST(strftime('%w', appt_date) AS INTEGER) = ? AND appt_time >= ? AND appt_time < ?
     ORDER BY appt_date, appt_time`,
    [row.doctor_id, from, row.day_of_week, row.start_time, row.end_time]
  );
  const kept = outside ? rows.filter((r) => !(r.appt_time >= outside.start && r.appt_time < outside.end)) : rows;
  return { count: kept.length, firstDate: kept.length ? kept[0].appt_date : null, lastDate: kept.length ? kept[kept.length - 1].appt_date : null };
}

async function impact(doctorId, id) {
  const row = await db.one('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND id = ?', [doctorId, id]);
  const { today, tomorrow } = await daysFor(doctorId);
  if (!row || (row.effective_to && row.effective_to < today)) return { notFound: true };
  return { removedFrom: tomorrow, endsToday: !!(row.effective_to && row.effective_to <= today), bookings: await bookingsIn(row, tomorrow) };
}

// Change a block's hours, slot length and/or patients per slot from the next working day on, with the
// same versioning as changeCapacity (today keeps what patients booked against). Bookings that fall
// outside the new hours are kept and counted.
async function edit(doctorId, id, { startTime, endTime, slotMinutes, capacityPerSlot }) {
  const row = await db.one('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND id = ?', [doctorId, id]);
  const { today, tomorrow } = await daysFor(doctorId);
  if (!row || (row.effective_to && row.effective_to < today)) return { notFound: true };
  if (row.effective_to && row.effective_to < tomorrow) return { error: 'This block ends today, so there is nothing left to change.' };
  const next = { start: startTime || row.start_time, end: endTime || row.end_time, slot: slotMinutes || row.slot_minutes, capacity: capacityPerSlot || row.capacity_per_slot };
  if (next.start >= next.end) return { error: 'End time must be after start time.', field: 'endTime' };
  if (next.start === row.start_time && next.end === row.end_time && next.slot === row.slot_minutes && next.capacity === row.capacity_per_slot) return { unchanged: true, schedule: fromRow(row) };
  const others = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND id <> ? AND (effective_to IS NULL OR effective_to >= ?)',
    [doctorId, row.day_of_week, row.id, tomorrow]
  );
  if (others.some((o) => overlaps(next.start, next.end, o.start_time, o.end_time))) return { error: 'These hours overlap another block on that day.', field: 'startTime' };

  const walkIn = Math.min(bookingCore.walkInSeatsOf(row), next.capacity);
  const onlineQuota = walkIn === 0 ? null : Math.max(0, next.capacity - walkIn);
  let newId = row.id;
  if (row.effective_from && row.effective_from >= tomorrow) {
    await db.query('UPDATE doctor_schedules SET start_time = ?, end_time = ?, slot_minutes = ?, capacity_per_slot = ?, online_quota = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next.start, next.end, next.slot, next.capacity, onlineQuota, row.id]);
  } else {
    newId = await db.tx(async (conn) => {
      await conn.query('UPDATE doctor_schedules SET effective_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [today, row.id]);
      const res = await conn.query(
        `INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot, online_quota, emergency_seats, effective_from, effective_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.doctor_id, row.day_of_week, next.start, next.end, next.slot, next.capacity, onlineQuota, bookingCore.emergencySeatsOf(row), tomorrow, row.effective_to]
      );
      return res.insertId;
    });
  }
  const effectiveFrom = row.effective_from && row.effective_from > tomorrow ? row.effective_from : tomorrow;
  return {
    schedule: fromRow(await db.one('SELECT * FROM doctor_schedules WHERE id = ?', [newId])),
    effectiveFrom,
    firstDate: firstDateOn(row.day_of_week, effectiveFrom),
    outside: await bookingsIn(row, effectiveFrom, { outside: { start: next.start, end: next.end } }),
    overbooked: await overbookedFrom({ ...row, start_time: next.start, end_time: next.end }, effectiveFrom, next.capacity),
  };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function create(doctorId, { dayOfWeek, startTime, endTime, slotMinutes, capacityPerSlot }) {
  const { tomorrow } = await daysFor(doctorId);
  // Only blocks still running from tomorrow on can clash with the new one.
  const existing = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND (effective_to IS NULL OR effective_to >= ?)',
    [doctorId, dayOfWeek, tomorrow]
  );
  if (existing.some((row) => overlaps(startTime, endTime, row.start_time, row.end_time))) {
    return { error: 'This time block overlaps with an existing one on that day.' };
  }
  const result = await db.query(
    'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot, effective_from) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [doctorId, dayOfWeek, startTime, endTime, slotMinutes || 15, capacityPerSlot || 1, tomorrow]
  );
  return { id: result.insertId, effectiveFrom: tomorrow, firstDate: firstDateOn(dayOfWeek, tomorrow) };
}

// Upcoming slots of this block (from `from` on) that already hold more bookings than `capacity`.
// They are kept as booked; the response lists them so the doctor and front desk know.
async function overbookedFrom(row, from, capacity) {
  const rows = await db.query(
    `SELECT appt_date, appt_time, COUNT(*) AS n FROM appointments
     WHERE doctor_id = ? AND appt_date >= ? AND status <> 'cancelled' AND is_emergency = 0
       AND CAST(strftime('%w', appt_date) AS INTEGER) = ? AND appt_time >= ? AND appt_time < ?
     GROUP BY appt_date, appt_time HAVING COUNT(*) > ? ORDER BY appt_date, appt_time`,
    [row.doctor_id, from, row.day_of_week, row.start_time, row.end_time, capacity]
  );
  return rows.map((r) => ({ date: r.appt_date, time: r.appt_time, booked: Number(r.n), capacity }));
}

// Change a block's patients per slot from the next working day on. Walk-in seats held back by the
// front desk stay the same number (capped at the new capacity).
async function changeCapacity(doctorId, id, capacity) {
  const row = await db.one('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND id = ?', [doctorId, id]);
  const { today, tomorrow } = await daysFor(doctorId);
  if (!row || (row.effective_to && row.effective_to < today)) return { notFound: true };
  if (row.effective_to && row.effective_to < tomorrow) return { error: 'This block ends today, so there is nothing left to change.' };
  if (row.capacity_per_slot === capacity) return { unchanged: true, schedule: fromRow(row) };

  const walkIn = bookingCore.walkInSeatsOf(row);
  const onlineQuota = walkIn === 0 ? null : Math.max(0, capacity - walkIn);
  let newId = row.id;
  if (row.effective_from && row.effective_from >= tomorrow) {
    // Not in force yet: nothing has been booked against this version's capacity, so edit it.
    await db.query('UPDATE doctor_schedules SET capacity_per_slot = ?, online_quota = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [capacity, onlineQuota, row.id]);
  } else {
    newId = await db.tx(async (conn) => {
      await conn.query('UPDATE doctor_schedules SET effective_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [today, row.id]);
      const res = await conn.query(
        `INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot, online_quota, emergency_seats, effective_from, effective_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.doctor_id, row.day_of_week, row.start_time, row.end_time, row.slot_minutes, capacity, onlineQuota, bookingCore.emergencySeatsOf(row), tomorrow, row.effective_to]
      );
      return res.insertId;
    });
  }
  const effectiveFrom = row.effective_from && row.effective_from > tomorrow ? row.effective_from : tomorrow;
  return {
    schedule: fromRow(await db.one('SELECT * FROM doctor_schedules WHERE id = ?', [newId])),
    effectiveFrom,
    firstDate: firstDateOn(row.day_of_week, effectiveFrom),
    overbooked: await overbookedFrom(row, effectiveFrom, capacity),
  };
}

// Stop a block from the next working day on. A version not in force yet is deleted outright.
// Appointments already booked on its upcoming days are kept; the response counts them.
async function remove(doctorId, id) {
  const row = await db.one('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND id = ?', [doctorId, id]);
  const { today, tomorrow } = await daysFor(doctorId);
  if (!row || (row.effective_to && row.effective_to < today)) return { notFound: true };
  // Already ending today: removing it again would "succeed" without changing anything.
  if (row.effective_to && row.effective_to <= today) return { error: 'These hours already end today. Nothing more to remove.' };
  if (row.effective_from && row.effective_from >= tomorrow) {
    await db.query('DELETE FROM doctor_schedules WHERE id = ?', [row.id]);
  } else if (!row.effective_to || row.effective_to > today) {
    await db.query('UPDATE doctor_schedules SET effective_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [today, row.id]);
  }
  const kept = await db.one(
    `SELECT COUNT(*) AS n FROM appointments
     WHERE doctor_id = ? AND appt_date >= ? AND status <> 'cancelled'
       AND CAST(strftime('%w', appt_date) AS INTEGER) = ? AND appt_time >= ? AND appt_time < ?`,
    [doctorId, tomorrow, row.day_of_week, row.start_time, row.end_time]
  );
  return { removedFrom: tomorrow, keptAppointments: Number(kept.n) };
}

module.exports = { list, create, changeCapacity, edit, impact, remove, fromRow };
