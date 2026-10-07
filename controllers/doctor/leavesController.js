const db = require('../../db');
const { badRequest, notFound } = require('../../utils/http');
const { isISODate, todayISO } = require('../../utils/dates');

const toLeave = (r) => ({ id: r.id, doctorId: r.doctor_id, startDate: r.start_date, endDate: r.end_date, reason: r.reason });

// GET /api/doctor/leaves — my leaves, newest first
exports.list = async (req, res) => {
  const rows = await db.query('SELECT * FROM doctor_leaves WHERE doctor_id = ? ORDER BY start_date DESC', [req.doctorId]);
  res.json({ items: rows.map(toLeave) });
};

// POST /api/doctor/leaves { startDate, endDate, reason? }
exports.create = async (req, res) => {
  const { startDate, endDate, reason } = req.body || {};
  const fields = {};
  if (!isISODate(startDate)) fields.startDate = 'Enter a valid start date (YYYY-MM-DD).';
  if (!isISODate(endDate)) fields.endDate = 'Enter a valid end date (YYYY-MM-DD).';
  if (Object.keys(fields).length) throw badRequest('Please correct the highlighted fields.', fields);
  if (endDate < startDate) throw badRequest('End date must not be before the start date.', { endDate: 'Must be on or after the start date.' });
  if (endDate < todayISO()) throw badRequest('Leave must not be entirely in the past.', { endDate: 'Choose today or a future date.' });
  if (reason && String(reason).length > 200) throw badRequest('Reason is too long.', { reason: 'Keep it under 200 characters.' });

  try {
    const r = await db.query(
      'INSERT INTO doctor_leaves (doctor_id, start_date, end_date, reason, created_by) VALUES (?, ?, ?, ?, ?)',
      [req.doctorId, startDate, endDate, reason ? String(reason).trim() : null, req.user.id]
    );
    res.json({ ok: true, message: 'Leave added.', id: Number(r.insertId) });
  } catch (err) {
    // the overlap trigger in migration 009 aborts with a readable message
    if (/overlap/i.test(err.message)) throw badRequest('This leave overlaps with an existing one.');
    throw err;
  }
};

// DELETE /api/doctor/leaves/:id
exports.remove = async (req, res) => {
  const r = await db.query('DELETE FROM doctor_leaves WHERE doctor_id = ? AND id = ?', [req.doctorId, req.params.id]);
  if (!r.affectedRows) throw notFound('Leave not found.');
  res.json({ ok: true, message: 'Leave removed.' });
};
