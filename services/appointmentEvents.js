// Fires the appointment / payment notification events (see config/notificationEvents.js).
// Used by the patient API (book, pay, cancel, reschedule) and by POST /api/internal/events,
// so a booking made in the patient app reaches the doctor and receptionists immediately.
// Patients who have an app account get an in-app notification too; walk-in patients without
// an account are logged as unavailable, never faked.

const db = require('../db');
const appointmentModel = require('../models/appointmentModel');
const notifications = require('./notificationService');
const { EVENTS } = require('../config/notificationEvents');

const RECIPIENTS = {
  NEW_APPOINTMENT: ['doctor', 'receptionists'],
  APPOINTMENT_CONFIRMED: ['patient'],
  APPOINTMENT_CANCELLED: ['patient', 'receptionists', 'doctor'],
  APPOINTMENT_RESCHEDULED: ['patient', 'receptionists', 'doctor'],
  APPOINTMENT_REMINDER: ['patient', 'doctor'],
  PAYMENT_SUCCESS: ['patient', 'receptionists'],
  PAYMENT_FAILED: ['patient'],
};

// Returns null when the appointment doesn't exist, otherwise { event, delivered, results }.
async function fire(eventKey, appointmentId) {
  if (!RECIPIENTS[eventKey]) throw new Error(`Unsupported appointment event "${eventKey}".`);
  const appt = await appointmentModel.adminFindById(String(appointmentId || ''));
  if (!appt) return null;

  const owner = await db.one('SELECT account_user_id FROM patients WHERE id = (SELECT patient_id FROM appointments WHERE id = ?)', [appt.id]);
  const paid = await db.one("SELECT amount, transaction_id FROM payments WHERE appointment_id = ? AND status = 'PAID' ORDER BY id DESC LIMIT 1", [appt.id]);
  const data = {
    patient_name: appt.patientName, doctor_name: appt.doctorName.replace(/^Dr\.?\s*/i, ''), hospital_name: appt.hospitalName, branch_name: appt.branchName || 'Main',
    appointment_id: appt.id, appointment_date: appt.date, appointment_time: appt.time,
    payment_amount: `₹${paid ? paid.amount : appt.fee}`, transaction_id: (paid && paid.transaction_id) || appt.transactionId || '',
  };
  const recipients = [];
  for (const who of RECIPIENTS[eventKey]) {
    if (who === 'patient') recipients.push(owner && owner.account_user_id ? { userId: owner.account_user_id, role: 'PATIENT' } : { role: 'PATIENT' });
    if (who === 'doctor') recipients.push(...(await notifications.doctorUsers(appt.doctorId)));
    if (who === 'receptionists') recipients.push(...(await notifications.hospitalUsers(appt.hospitalId, 'RECEPTIONIST')));
  }
  const results = await notifications.trigger(eventKey, recipients, data, { link: { DOCTOR: '/doctor/appointments', default: '/appointments' } });
  return { event: EVENTS[eventKey].name, delivered: results.filter((r) => r.ok).length, results };
}

module.exports = { fire, EVENT_KEYS: Object.keys(RECIPIENTS) };
