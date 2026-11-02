const tokenModel = require('../../models/tokenModel');
const bookingCore = require('../../services/bookingCore');
const { badRequest, notFound } = require('../../utils/http');
const { isISODate } = require('../../utils/dates');
const notifications = require('../../services/notificationService');
const consultation = require('../../services/consultation');
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
  const items = await tokenModel.query(req.hospitalId, { date, doctorId: req.doctorId });
  const today = await hospitalToday(req);
  res.json({ date, today, editable: date === today, items, summary: tokenModel.summarize(items) });
};

// POST /api/doctor/queue/call-next { date }
exports.callNext = async (req, res) => {
  const date = await readDate(req);
  if (date !== await hospitalToday(req)) throw badRequest("Only today's queue can be changed.");
  const items = await tokenModel.query(req.hospitalId, { date, doctorId: req.doctorId, status: 'waiting' });
  const next = items.sort(bookingCore.queueOrder)[0];
  if (!next) throw badRequest('No patients are waiting.');
  const token = await tokenModel.updateStatus(req.hospitalId, next.id, 'called');
  await notifyReceptionists(req, token);
  res.json({ ok: true, message: `${token.code} called — ${token.patientName}.`, token });
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
