const scheduleModel = require('../../models/doctorScheduleModel');
const { badRequest, notFound } = require('../../utils/http');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

exports.list = async (req, res) => {
  const items = await scheduleModel.list(req.doctorId);
  res.json({ items });
};

exports.create = async (req, res) => {
  const { dayOfWeek, startTime, endTime, slotMinutes, capacityPerSlot } = req.body || {};
  const day = Number(dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) throw badRequest('Choose a valid day.', { dayOfWeek: 'Choose a day.' });
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw badRequest('Enter valid start and end times.');
  if (startTime >= endTime) throw badRequest('End time must be after start time.', { endTime: 'Must be after the start time.' });
  const minutes = Number(slotMinutes) || 15;
  if (minutes < 5 || minutes > 120) throw badRequest('Appointment duration must be between 5 and 120 minutes.');

  const capacity = capacityPerSlot === undefined || capacityPerSlot === '' ? 1 : Number(capacityPerSlot);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) throw badRequest('Patients per slot must be a whole number between 1 and 50.', { capacityPerSlot: 'Enter 1 to 50.' });

  const result = await scheduleModel.create(req.doctorId, { dayOfWeek: day, startTime, endTime, slotMinutes: minutes, capacityPerSlot: capacity });
  if (result.error) throw badRequest(result.error);
  res.json({ ok: true, message: 'Working hours added.', id: result.id });
};

exports.remove = async (req, res) => {
  const removed = await scheduleModel.remove(req.doctorId, req.params.id);
  if (!removed) throw notFound('Schedule block not found.');
  res.json({ ok: true, message: 'Working hours removed.' });
};
