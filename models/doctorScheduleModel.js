// A doctor's weekly working hours. Each row is one time block; a day with a
// lunch break (e.g. 09:00-13:00 and 16:00-19:00) is simply two rows for the
// same day_of_week — no separate break columns needed.

const db = require('../db');

function fromRow(row) {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    slotMinutes: row.slot_minutes,
    capacityPerSlot: row.capacity_per_slot,
  };
}

async function list(doctorId) {
  const rows = await db.query('SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week, start_time', [doctorId]);
  return rows.map(fromRow);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function create(doctorId, { dayOfWeek, startTime, endTime, slotMinutes, capacityPerSlot }) {
  const existing = await db.query('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?', [doctorId, dayOfWeek]);
  if (existing.some((row) => overlaps(startTime, endTime, row.start_time, row.end_time))) {
    return { error: 'This time block overlaps with an existing one on that day.' };
  }
  const result = await db.query(
    'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot) VALUES (?, ?, ?, ?, ?, ?)',
    [doctorId, dayOfWeek, startTime, endTime, slotMinutes || 15, capacityPerSlot || 1]
  );
  return { id: result.insertId };
}

async function remove(doctorId, id) {
  const res = await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ? AND id = ?', [doctorId, id]);
  return res.affectedRows > 0;
}

module.exports = { list, create, remove, fromRow };
