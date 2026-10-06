const tokenModel = require('../../models/tokenModel');
const { badRequest, notFound } = require('../../utils/http');
const { isISODate, todayISO } = require('../../utils/dates');
const notifications = require('../../services/notificationService');

const LABEL = { called: 'Called', in_consultation: 'In Consultation', completed: 'Completed', skipped: 'Skipped' };

async function notifyReceptionists(req, token) {
  await notifications.trigger('TOKEN_UPDATED', await notifications.hospitalUsers(req.hospitalId, 'RECEPTIONIST'), {
    token_number: token.code, token_status: LABEL[token.status] || token.status, patient_name: token.patientName, doctor_name: token.doctorName.replace(/^Dr\.?\s*/i, ''),
  }, { link: '/tokens' });
}

function readDate(value) {
  if (!value) return todayISO();
  if (!isISODate(value)) throw badRequest('"date" must be a valid date (YYYY-MM-DD).');
  return value;
}

async function ownToken(req) {
  const token = await tokenModel.findById(req.hospitalId, req.params.id);
  if (!token || token.doctorId !== req.doctorId) throw notFound('Token not found.');
  return token;
}

// GET /api/doctor/queue?date=
exports.list = async (req, res) => {
  const date = readDate(req.query.date);
  const items = await tokenModel.query(req.hospitalId, { date, doctorId: req.doctorId });
  res.json({ date, items, summary: tokenModel.summarize(items) });
};

// POST /api/doctor/queue/call-next { date }
exports.callNext = async (req, res) => {
  const date = readDate(req.body && req.body.date);
  const items = await tokenModel.query(req.hospitalId, { date, doctorId: req.doctorId, status: 'waiting' });
  const next = items.sort((a, b) => a.number - b.number)[0];
  if (!next) throw badRequest('No patients are waiting.');
  const token = await tokenModel.updateStatus(req.hospitalId, next.id, 'called');
  await notifyReceptionists(req, token);
  res.json({ ok: true, message: `${token.code} called — ${token.patientName}.`, token });
};

exports.start = async (req, res) => {
  const token = await ownToken(req);
  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, 'in_consultation');
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `Consultation started for ${updated.patientName}.`, token: updated });
};

exports.complete = async (req, res) => {
  const token = await ownToken(req);
  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, 'completed');
  await notifyReceptionists(req, updated);
  res.json({ ok: true, message: `${updated.code} marked completed.`, token: updated });
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
