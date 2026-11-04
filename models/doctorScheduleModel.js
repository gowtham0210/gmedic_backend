// A doctor's weekly working hours. Each row is one time block; a day with a
// lunch break (e.g. 09:00-13:00 and 16:00-19:00) is simply two rows for the
// same day_of_week — no separate break columns needed.
//
// Changes never reach back into days already open for booking, because patients hold seats against today's slots
// (their capacity, length and token numbers):
//   - EDITING or REMOVING a block takes effect from the next working day (tomorrow in the hospital's time zone). An edit
//     closes the version in force today (effective_to = today) and starts a new version tomorrow, so today's slots keep the
//     capacity patients booked against.
//   - EDITING a block that is NOT IN FORCE YET (no patient can have booked into it) is the same as adding it: on today's weekday it
//     starts today under the same conditions (see pullToday). A block that is already in force, or that replaces a version ending
//     today, always changes from tomorrow.
//   - ADDING a block for a weekday that is today starts today when that only ADDS slots and cannot disturb anything booked:
//     its start time is still ahead, it overlaps no hours in force today, and nobody is booked or holding a seat later today.
//     (Token numbers follow the slots of the day in order; a block inserted before existing bookings would give new patients
//     higher numbers than patients already booked later, and the doctor's queue is called in token order.) Otherwise it starts
//     on the next such weekday, as every added block used to.
// Appointments are never moved or cancelled by a schedule change; a slot left over its new capacity just takes no new bookings.

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
  const now = nowIn(h ? h.timezone : undefined);
  return { today: now.date, tomorrow: addDays(now.date, 1), nowMinutes: now.minutes };
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

// A block that has not started yet (effective_from after today, so nobody can have booked into it) on today's weekday can start today
// when it could be added today: its start time is still ahead, it overlaps no other hours of that day, it is not the new version of
// hours that end today (those change from tomorrow, today keeps what patients booked against), and nobody is booked or holding a
// seat at or after its start time today.
async function pullToday(row, next, { today, nowMinutes }) {
  if (!row.effective_from || row.effective_from <= today || row.day_of_week !== weekdayOf(today)) return false;
  if (minutesOf(next.start) <= nowMinutes || minutesOf(next.end) - minutesOf(next.start) < next.slot) return false;
  const predecessor = await db.one('SELECT 1 AS x FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND id <> ? AND effective_to = ?', [row.doctor_id, row.day_of_week, row.id, today]);
  if (predecessor) return false;
  const others = await db.query('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND id <> ? AND (effective_to IS NULL OR effective_to >= ?)', [row.doctor_id, row.day_of_week, row.id, today]);
  if (others.some((o) => overlaps(next.start, next.end, o.start_time, o.end_time))) return false;
  return !(await firstBookedFrom(row.doctor_id, today, next.start));
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
  if (await pullToday(row, next, await daysFor(doctorId))) {
    const walkInNow = Math.min(bookingCore.walkInSeatsOf(row), next.capacity);
    await db.query(
      'UPDATE doctor_schedules SET start_time = ?, end_time = ?, slot_minutes = ?, capacity_per_slot = ?, online_quota = ?, effective_from = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [next.start, next.end, next.slot, next.capacity, walkInNow === 0 ? null : Math.max(0, next.capacity - walkInNow), today, row.id]
    );
    return { schedule: fromRow(await db.one('SELECT * FROM doctor_schedules WHERE id = ?', [row.id])), startsToday: true, effectiveFrom: today, firstDate: today, outside: { count: 0 }, overbooked: [] };
  }
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

const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday, like doctor_schedules

// The earliest time today, at or after `from`, that a patient is booked or holding a seat for (an appointment still on, or a live
// payment hold), or null. Emergency walk-ins take no slot and are not counted.
async function firstBookedFrom(doctorId, date, from) {
  const booked = await db.one(
    "SELECT MIN(appt_time) AS t FROM appointments WHERE doctor_id = ? AND appt_date = ? AND appt_time >= ? AND status <> 'cancelled' AND is_emergency = 0",
    [doctorId, date, from]
  );
  const held = await db.one(
    "SELECT MIN(appt_time) AS t FROM slot_holds WHERE doctor_id = ? AND appt_date = ? AND appt_time >= ? AND status = 'HELD' AND held_until > datetime('now')",
    [doctorId, date, from]
  );
  return [booked && booked.t, held && held.t].filter(Boolean).sort()[0] || null;
}

// Add a weekly block. For a weekday that is today it starts today when that is safe (see the header), else on the next such weekday;
// any other weekday starts tomorrow, which first falls on that weekday.
async function create(doctorId, { dayOfWeek, startTime, endTime, slotMinutes, capacityPerSlot }) {
  const { today, tomorrow, nowMinutes } = await daysFor(doctorId);
  let from = tomorrow;
  let startsToday = false;
  let laterBecause = null;
  if (dayOfWeek === weekdayOf(today)) {
    if (minutesOf(startTime) <= nowMinutes) {
      laterBecause = 'The start time has already passed today';
    } else {
      const booked = await firstBookedFrom(doctorId, today, startTime);
      if (booked) laterBecause = `Patients are already booked from ${booked} today`;
      else { from = today; startsToday = true; }
    }
  }
  // Only blocks still running on the day the new one starts can clash with it (the database also refuses an overlap).
  const existing = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND (effective_to IS NULL OR effective_to >= ?)',
    [doctorId, dayOfWeek, from]
  );
  if (existing.some((row) => overlaps(startTime, endTime, row.start_time, row.end_time))) {
    return { error: startsToday ? 'This time block overlaps hours already set for that day (including hours that start tomorrow).' : 'This time block overlaps with an existing one on that day.' };
  }
  const result = await db.query(
    'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot, effective_from) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [doctorId, dayOfWeek, startTime, endTime, slotMinutes || 15, capacityPerSlot || 1, from]
  );
  return { id: result.insertId, effectiveFrom: from, firstDate: startsToday ? today : firstDateOn(dayOfWeek, from), startsToday, laterBecause };
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

// Anyone booked (or holding a seat) in this block's hours on any date from `from` on?
async function bookedAnyFrom(row, from) {
  const booked = await db.one(
    `SELECT COUNT(*) AS n FROM appointments WHERE doctor_id = ? AND appt_date >= ? AND status <> 'cancelled' AND is_emergency = 0
       AND CAST(strftime('%w', appt_date) AS INTEGER) = ? AND appt_time >= ? AND appt_time < ?`,
    [row.doctor_id, from, row.day_of_week, row.start_time, row.end_time]
  );
  const held = await db.one(
    `SELECT COUNT(*) AS n FROM slot_holds WHERE doctor_id = ? AND appt_date >= ? AND status = 'HELD' AND held_until > datetime('now')
       AND CAST(strftime('%w', appt_date) AS INTEGER) = ? AND appt_time >= ? AND appt_time < ?`,
    [row.doctor_id, from, row.day_of_week, row.start_time, row.end_time]
  );
  return Number(booked.n) + Number(held.n) > 0;
}

// Stop a block from the next working day on. A version not in force yet, or one added today that nobody has booked into, is deleted outright.
// Appointments already booked on its upcoming days are kept; the response counts them.
async function remove(doctorId, id) {
  const row = await db.one('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND id = ?', [doctorId, id]);
  const { today, tomorrow } = await daysFor(doctorId);
  if (!row || (row.effective_to && row.effective_to < today)) return { notFound: true };
  // Already ending today: removing it again would "succeed" without changing anything.
  if (row.effective_to && row.effective_to <= today) return { error: 'These hours already end today. Nothing more to remove.' };
  const neverUsed = row.effective_from === today && !(await bookedAnyFrom(row, today));
  if ((row.effective_from && row.effective_from >= tomorrow) || neverUsed) {
    // Not in force yet, or added today and nothing booked or held in it on any date: nothing depends on it, so it is taken back whole.
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
