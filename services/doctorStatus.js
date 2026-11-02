// Deactivating a doctor who has left (Super Admin or the hospital's front desk). Never a delete:
// appointments, payments and history stay. An inactive doctor can't be booked in any channel
// (bookingCore.BOOKABLE_DOCTOR) and their doctor-portal login is locked.

const db = require('../db');
const auditLog = require('./auditLog');
const { badRequest } = require('../utils/http');

// Upcoming appointments that still need someone to move or cancel them.
async function impact(doctorId) {
  const rows = await db.query(
    `SELECT appt_date AS date, COUNT(*) AS n FROM appointments
      WHERE doctor_id = ? AND status IN ('confirmed','pending') AND appt_date >= date('now','localtime')
      GROUP BY appt_date ORDER BY appt_date`,
    [doctorId]
  );
  const login = await db.one("SELECT status FROM users WHERE doctor_id = ? AND role = 'DOCTOR'", [doctorId]);
  return {
    upcomingAppointments: rows.reduce((sum, r) => sum + Number(r.n), 0),
    firstDate: rows.length ? rows[0].date : null,
    lastDate: rows.length ? rows[rows.length - 1].date : null,
    activeLogin: !!(login && login.status === 'ACTIVE'),
  };
}

async function setStatus(req, doctor, status, reasonInput) {
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose Active or Inactive.');
  const reason = String(reasonInput || '').trim().slice(0, 300);
  if (status === (doctor.status || 'ACTIVE')) return { changed: false };
  if (status === 'INACTIVE' && !reason) throw badRequest('Enter the reason for deactivating this doctor.', { reason: 'Enter a reason.' });
  const before = await impact(doctor.id);
  await db.tx(async (conn) => {
    await conn.query('UPDATE doctors SET status = ?, status_reason = ?, status_changed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, reason || null, doctor.id]);
    if (status === 'INACTIVE') {
      await conn.query("UPDATE users SET status = 'INACTIVE', session_version = session_version + 1 WHERE doctor_id = ? AND role = 'DOCTOR' AND status = 'ACTIVE'", [doctor.id]);
    }
  });
  await auditLog.record({
    req, action: `DOCTOR_${status}`, entityType: 'DOCTOR', entityId: doctor.id,
    summary: `${doctor.name}: ${status === 'INACTIVE' ? `deactivated (${reason}); ${before.upcomingAppointments} upcoming appointment(s) to handle` : 'reactivated'}`,
    previousValue: { status: doctor.status || 'ACTIVE' }, newValue: { status, reason: reason || null },
  });
  return { changed: true, impact: before };
}

module.exports = { impact, setStatus };
