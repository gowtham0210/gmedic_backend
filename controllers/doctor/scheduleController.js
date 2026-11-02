const scheduleModel = require('../../models/doctorScheduleModel');
const { badRequest, notFound } = require('../../utils/http');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function readCapacity(value) {
  const capacity = value === undefined || value === '' ? 1 : Number(value);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) throw badRequest('Patients per slot must be a whole number between 1 and 50.', { capacityPerSlot: 'Enter 1 to 50.' });
  return capacity;
}

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
  const minutes = slotMinutes === undefined || slotMinutes === null || slotMinutes === '' ? 15 : Number(slotMinutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw badRequest('Appointment duration must be a whole number of minutes between 5 and 120.', { slotMinutes: 'Between 5 and 120 minutes.' });

  const capacity = readCapacity(capacityPerSlot);

  const result = await scheduleModel.create(req.doctorId, { dayOfWeek: day, startTime, endTime, slotMinutes: minutes, capacityPerSlot: capacity });
  if (result.error) throw badRequest(result.error);
  res.json({ ok: true, message: `Working hours added from ${result.firstDate}.`, id: result.id, effectiveFrom: result.effectiveFrom });
};

// PATCH /api/doctor/schedule/:id { startTime?, endTime?, slotMinutes?, capacityPerSlot? }
// Takes effect from the next working day; appointments already booked are kept as they are.
exports.update = async (req, res) => {
  const body = req.body || {};
  const onlyCapacity = body.startTime === undefined && body.endTime === undefined && body.slotMinutes === undefined;
  if (onlyCapacity && body.capacityPerSlot === undefined) throw badRequest('Nothing to change. Send the hours, slot length or patients per slot.');
  if (onlyCapacity) {
    const capacity = readCapacity(body.capacityPerSlot);
    const result = await scheduleModel.changeCapacity(req.doctorId, Number(req.params.id), capacity);
    if (result.notFound) throw notFound('Schedule block not found.');
    if (result.error) throw badRequest(result.error);
    if (result.unchanged) return res.json({ ok: true, message: 'No changes to save.', schedule: result.schedule });
    const over = result.overbooked.length;
    return res.json({
      ok: true,
      message: `Patients per slot changes to ${capacity} from ${result.firstDate}. Today's slots and existing bookings are unchanged.`
        + (over ? ` ${over} upcoming slot${over === 1 ? ' already has' : 's already have'} more bookings than that; they are kept.` : ''),
      schedule: result.schedule,
      effectiveFrom: result.effectiveFrom,
      overbooked: result.overbooked,
    });
  }
  const errors = {};
  if (body.startTime !== undefined && !TIME_RE.test(body.startTime)) errors.startTime = 'Enter a valid time.';
  if (body.endTime !== undefined && !TIME_RE.test(body.endTime)) errors.endTime = 'Enter a valid time.';
  const minutes = body.slotMinutes === undefined ? undefined : Number(body.slotMinutes);
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 5 || minutes > 120)) errors.slotMinutes = 'Between 5 and 120 minutes.';
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
  const capacity = body.capacityPerSlot === undefined ? undefined : readCapacity(body.capacityPerSlot);
  const result = await scheduleModel.edit(req.doctorId, Number(req.params.id), { startTime: body.startTime, endTime: body.endTime, slotMinutes: minutes, capacityPerSlot: capacity });
  if (result.notFound) throw notFound('Schedule block not found.');
  if (result.error) throw badRequest(result.error, result.field ? { [result.field]: result.error } : undefined);
  if (result.unchanged) return res.json({ ok: true, message: 'No changes to save.', schedule: result.schedule });
  const out = result.outside.count;
  res.json({
    ok: true,
    message: `New hours apply from ${result.firstDate}. Today and existing bookings are unchanged.`
      + (out ? ` ${out} booked appointment${out === 1 ? ' falls' : 's fall'} outside the new hours and ${out === 1 ? 'is' : 'are'} kept; the front desk can move ${out === 1 ? 'it' : 'them'}.` : ''),
    schedule: result.schedule,
    effectiveFrom: result.effectiveFrom,
    outside: result.outside,
    overbooked: result.overbooked,
  });
};

// GET /api/doctor/schedule/:id/impact: what removing the block leaves behind, shown before confirming.
exports.impact = async (req, res) => {
  const result = await scheduleModel.impact(req.doctorId, Number(req.params.id));
  if (result.notFound) throw notFound('Schedule block not found.');
  res.json(result);
};

// DELETE /api/doctor/schedule/:id — stops the block from the next working day on.
exports.remove = async (req, res) => {
  const result = await scheduleModel.remove(req.doctorId, Number(req.params.id));
  if (result.notFound) throw notFound('Schedule block not found.');
  if (result.error) throw badRequest(result.error);
  const kept = result.keptAppointments;
  res.json({
    ok: true,
    message: `Working hours removed from ${result.removedFrom}.`
      + (kept ? ` ${kept} appointment${kept === 1 ? ' already booked in these hours is' : 's already booked in these hours are'} kept.` : ''),
    removedFrom: result.removedFrom,
    keptAppointments: kept,
  });
};
