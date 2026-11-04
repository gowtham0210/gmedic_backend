const tokenModel = require('../../models/tokenModel');
const bookingCore = require('../../services/bookingCore');
const { HttpError, badRequest, notFound } = require('../../utils/http');
const { isISODate } = require('../../utils/dates');
const notifications = require('../../services/notificationService');
const consultation = require('../../services/consultation');
const emergency = require('../../services/emergencyWalkIn');
const auditLog = require('../../services/auditLog');
const { hospitalToday: hospitalTodayOf } = require('../../models/appointmentModel');

const LABEL = { called: 'Called', in_consultation: 'In Consultation', completed: 'Completed', skipped: 'Skipped' };

async function notifyReceptionists(req, token) {
  await notifications.trigger('TOKEN_UPDATED', await notifications.hospitalUsers(req.hospitalId, 'RECEPTIONIST'), {
    token_number: token.code, token_status: LABEL[token.status] || token.status, patient_name: token.patientName, doctor_name: token.doctorName.replace(/^Dr\.?\s*/i, ''),
  }, { link: '/tokens' });
}

async function readDate(req) {
  const value = req.query.date || (req.body && req.body.date);
  if (!value) return hospitalToday(req);
  if (!isISODate(value)) throw badRequest('"date" must be a valid date (YYYY-MM-DD).');
  return value;
}

const hospitalToday = (req) => hospitalTodayOf(req.hospitalId);

// Only today's queue can be worked; past and future days are read-only.
async function ownToken(req) {
  const token = await tokenModel.findById(req.hospitalId, req.params.id);
  if (!token || token.doctorId !== req.doctorId) throw notFound('Token not found.');
  if (token.date !== await hospitalToday(req)) throw badRequest("Only today's queue can be changed.");
  return token;
}

// GET /api/doctor/queue?date=
exports.list = async (req, res) => {
  const date = await readDate(req);
  const all = await tokenModel.query(req.hospitalId, { date, doctorId: req.doctorId });
  const today = await hospitalToday(req);
  // `position` is the suggested calling order of the waiting patients (bookingCore.sortQueue); it is a suggestion, the doctor can call anyone.
  const waiting = bookingCore.sortQueue(all.filter((t) => t.status === 'waiting'));
  const position = new Map(waiting.map((t, i) => [t.id, i + 1]));
  const items = all.map((t) => ({ ...t, position: position.get(t.id) || null }));
  const open = (t) => ['waiting', 'called', 'in_consultation', 'skipped'].includes(t.status);
  const summary = {
    ...tokenModel.summarize(all),
    // Emergency walk-ins nobody has assessed yet, and the critical ones: the page keeps these in front of the doctor.
    awaitingTriage: all.filter((t) => t.awaitingTriage && open(t)).length,
    critical: all.filter((t) => t.triage === 'CRITICAL' && open(t)).length,
  };
  res.json({ date, today, editable: date === today, items, suggestedNextId: waiting[0] ? waiting[0].id : null, summary });
};

// POST /api/doctor/queue/call-next { date }
exports.callNext = async (req, res) => {
  const date = await readDate(req);
  if (date !== await hospitalToday(req)) throw badRequest("Only today's queue can be changed.");
  const items = await tokenModel.query(req.hospitalId, { date, doctorId: req.doctorId, status: 'waiting' });
  const next = bookingCore.sortQueue(items)[0];
  if (!next) throw badRequest('No patients are waiting.');
  // An emergency walk-in that nobody has assessed is never called by the automatic "next" without a clinical look first.
  if (next.awaitingTriage) throw new HttpError(409, `${next.code} (${next.patientName}) is an emergency walk-in awaiting triage. Assess them first, or choose a patient to call.`, { tokenId: next.id, needsTriage: true });
  const token = await tokenModel.updateStatus(req.hospitalId, next.id, 'called');
  await notifyReceptionists(req, token);
  res.json({ ok: true, message: `${token.code} called — ${token.patientName}.`, token });
};

// POST /api/doctor/queue/:id/call { note? }: the doctor calls a particular waiting or skipped patient. The suggested order
// (bookingCore.sortQueue) is only a suggestion, so this is always allowed; calling someone other than the suggested patient,
// or a walk-in nobody has assessed yet, is recorded in the audit log. A patient already in consultation is never touched.
exports.call = async (req, res) => {
  const token = await ownToken(req);
  if (!['waiting', 'skipped'].includes(token.status)) throw badRequest(`A patient who is ${token.status.replace('_', ' ')} cannot be called.`);
  const suggested = bookingCore.sortQueue(await tokenModel.query(req.hospitalId, { date: token.date, doctorId: req.doctorId, status: 'waiting' }))[0] || null;
  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, 'called');
  const note = String((req.body && req.body.note) || '').trim().slice(0, 200) || null;
  const ahead = !!suggested && suggested.id !== token.id;
  if (ahead || token.awaitingTriage) {
    await auditLog.record({
      req, action: 'QUEUE_OVERRIDE', entityType: 'TOKEN', entityId: token.id,
      summary: `${token.code} called${ahead ? ` ahead of ${suggested.code}` : ''}${token.awaitingTriage ? ' before triage' : ''}${note ? `: ${note}` : ''}`,
      previousValue: { suggested: suggested ? suggested.code : null }, newValue: { called: token.code, awaitingTriage: token.awaitingTriage, note },
    });
  }
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `${updated.code} called — ${updated.patientName}.`, token: updated });
};

// PATCH /api/doctor/queue/:id/triage { priority, note? }: only a doctor assesses triage (see services/emergencyWalkIn.js).
exports.triage = async (req, res) => {
  const { token, changed } = await emergency.setTriage(req.hospitalId, req.user, req.params.id, req.body || {});
  res.json({ ok: true, message: changed ? `${token.code} assessed as ${token.triage.replace('_', ' ').toLowerCase()}.` : 'No change.', changed, token });
};

// One patient at a time: the buttons hide this in the page, the API enforces it.
async function assertNoOtherConsultation(req, token) {
  const busy = (await tokenModel.query(req.hospitalId, { date: token.date, doctorId: req.doctorId, status: 'in_consultation' })).find((t) => t.id !== token.id);
  if (busy) throw badRequest(`${busy.code} (${busy.patientName}) is still in consultation. Complete it before starting another patient.`);
}

exports.start = async (req, res) => {
  const token = await ownToken(req);
  await assertNoOtherConsultation(req, token);
  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, 'in_consultation');
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `Consultation started for ${updated.patientName}.`, token: updated });
};

exports.complete = async (req, res) => {
  const token = await ownToken(req);
  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, 'completed');
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `${updated.code} marked completed.`, token: updated, undoMinutes: updated.appointmentId ? consultation.REOPEN_MINUTES : 0 });
};

// POST /api/doctor/queue/:id/reopen: undo "Complete" pressed by mistake (the same day, within
// consultation.REOPEN_MINUTES). The token goes back to in consultation with its appointment.
exports.reopen = async (req, res) => {
  const token = await tokenModel.findById(req.hospitalId, req.params.id);
  if (!token || token.doctorId !== req.doctorId) throw notFound('Token not found.');
  if (token.status !== 'completed' || !token.appointmentId) throw badRequest('Only a completed token can be reopened.');
  await assertNoOtherConsultation(req, token);
  await consultation.reopen(req, req.doctorId, token.appointmentId);
  const updated = await tokenModel.findById(req.hospitalId, token.id);
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `${updated.code} is back in consultation.`, token: updated });
};

exports.skip = async (req, res) => {
  const token = await ownToken(req);
  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, 'skipped');
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `${updated.code} skipped.`, token: updated });
};

exports.recall = async (req, res) => {
  const token = await ownToken(req);
  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, 'called');
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `${updated.code} called back.`, token: updated });
};
