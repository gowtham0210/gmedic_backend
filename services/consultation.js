// A doctor's side of a consultation that the queue and the appointments screen share: taking back a
// "completed" pressed by mistake, and the clinical notes.
//
// Undo: only the doctor of the appointment, only on the day, and only within REOPEN_MINUTES of it
// being completed. The appointment goes back to confirmed (the reopen_count bump is what lets
// trg_guard_appt_reopen through, see migration 027) and its token back to in consultation, in one
// transaction, so the pair stays in step.

const db = require('../db');
const auditLog = require('./auditLog');
const { todayIn } = require('../models/appointmentModel');
const { HttpError, badRequest, notFound } = require('../utils/http');

const REOPEN_MINUTES = 10;
const conflict = (message) => new HttpError(409, message);

async function load(doctorId, appointmentId) {
  const a = await db.one(
    `SELECT a.*, h.timezone FROM appointments a JOIN hospitals h ON h.id = a.hospital_id WHERE a.id = ? AND a.doctor_id = ?`,
    [String(appointmentId || ''), doctorId]
  );
  if (!a) throw notFound('Appointment not found.');
  return a;
}

// When the appointment was last completed (UTC ms), from its status history.
async function completedAtMs(appointmentId) {
  const row = await db.one("SELECT created_at FROM appointment_status_history WHERE appointment_id = ? AND to_status = 'completed' ORDER BY id DESC LIMIT 1", [appointmentId]);
  return row ? Date.parse(`${String(row.created_at).replace(' ', 'T')}Z`) : null;
}

// { canReopen, reopenUntil } for a completed appointment row (with timezone).
async function reopenWindow(a) {
  if (a.status !== 'completed' || a.appt_date !== todayIn(a.timezone)) return { canReopen: false, reopenUntil: null };
  const at = await completedAtMs(a.id);
  if (!at) return { canReopen: false, reopenUntil: null };
  const until = at + REOPEN_MINUTES * 60000;
  return { canReopen: Date.now() < until, reopenUntil: new Date(until).toISOString() };
}

async function reopen(req, doctorId, appointmentId) {
  const a = await load(doctorId, appointmentId);
  if (a.status !== 'completed') throw conflict('Only a completed appointment can be reopened.');
  const { canReopen } = await reopenWindow(a);
  if (!canReopen) throw conflict(`A completed consultation can only be reopened on the day, within ${REOPEN_MINUTES} minutes.`);
  // Back to what it was before it was completed (an unpaid appointment returns to pending).
  const before = await db.one("SELECT from_status FROM appointment_status_history WHERE appointment_id = ? AND to_status = 'completed' ORDER BY id DESC LIMIT 1", [a.id]);
  const restored = before && before.from_status === 'pending' ? 'pending' : 'confirmed';
  await db.tx(async (conn) => {
    const done = await conn.query("UPDATE appointments SET status = ?, reopen_count = reopen_count + 1 WHERE id = ? AND status = 'completed'", [restored, a.id]);
    if (!done.affectedRows) throw conflict('This appointment changed while you were looking at it. Refresh and try again.');
    await conn.query(
      `UPDATE tokens SET status = 'in_consultation', completed_at = NULL
        WHERE id = (SELECT id FROM tokens WHERE appointment_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1)`,
      [a.id]
    );
  });
  await auditLog.record({ req, action: 'APPOINTMENT_REOPENED', entityType: 'APPOINTMENT', entityId: a.id, summary: `Reopened ${a.id} (completed by mistake)`, previousValue: { status: 'completed' }, newValue: { status: restored } });
}

// ---- Consultation notes (append-only versions) ----
const NOTE_FIELDS = { diagnosis: 500, notes: 4000, prescription: 2000 };

const noteJson = (r) => ({ version: r.version, diagnosis: r.diagnosis, notes: r.notes, prescription: r.prescription, createdBy: r.created_by_name || null, createdAt: db.iso(r.created_at) });

async function notesOf(appointmentId) {
  const rows = await db.query(
    `SELECT n.*, u.name AS created_by_name FROM consultation_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.appointment_id = ? ORDER BY n.version DESC`,
    [appointmentId]
  );
  return rows.map(noteJson);
}

async function saveNotes(req, doctorId, appointmentId, body = {}) {
  const a = await load(doctorId, appointmentId);
  if (a.status === 'cancelled') throw badRequest('This appointment was cancelled, so there is no consultation to record.');
  if (a.appt_date > todayIn(a.timezone)) throw badRequest('Notes can be written from the day of the appointment.');
  const value = {};
  const errors = {};
  for (const [field, max] of Object.entries(NOTE_FIELDS)) {
    if (body[field] != null && typeof body[field] !== 'string') { errors[field] = 'Enter text.'; continue; }
    const text = String(body[field] == null ? '' : body[field]).trim();
    if (text.length > max) errors[field] = `Keep this under ${max} characters.`;
    value[field] = text || null;
  }
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
  if (!value.diagnosis && !value.notes && !value.prescription) throw badRequest('Write a diagnosis, notes or a prescription.', { notes: 'Write something to save.' });
  const latest = (await notesOf(a.id))[0];
  if (latest && latest.diagnosis === value.diagnosis && latest.notes === value.notes && latest.prescription === value.prescription) return { changed: false, notes: await notesOf(a.id) };
  await db.tx(async (conn) => {
    const next = (await conn.one('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM consultation_notes WHERE appointment_id = ?', [a.id])).v;
    await conn.query(
      'INSERT INTO consultation_notes (appointment_id, doctor_id, version, diagnosis, notes, prescription, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [a.id, doctorId, next, value.diagnosis, value.notes, value.prescription, req.user.id]
    );
  });
  return { changed: true, notes: await notesOf(a.id) };
}

module.exports = { REOPEN_MINUTES, reopenWindow, reopen, notesOf, saveNotes, load };
