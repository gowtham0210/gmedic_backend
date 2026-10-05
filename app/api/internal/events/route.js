import { NextResponse } from 'next/server';
import crypto from 'crypto';
import appointmentModel from '../../../../models/appointmentModel';
import notifications from '../../../../services/notificationService';
import { EVENTS } from '../../../../config/notificationEvents';

// Server-to-server endpoint for events that originate outside this portal —
// the patient app booking, paying for or cancelling an appointment. The caller
// authenticates with the shared INTERNAL_EVENT_KEY (header "x-internal-key").
//
//   POST /api/internal/events   { "eventKey": "APPOINTMENT_CONFIRMED", "appointmentId": "APT10555" }
//
// Patients have no portal account, so their notification is logged as
// unavailable (never faked); doctor and receptionist recipients are delivered.

const PATIENT = { role: 'PATIENT' };
const RECIPIENTS = {
  NEW_APPOINTMENT: ['doctor', 'receptionists'],
  APPOINTMENT_CONFIRMED: ['patient'],
  APPOINTMENT_CANCELLED: ['patient', 'receptionists', 'doctor'],
  APPOINTMENT_RESCHEDULED: ['patient', 'receptionists', 'doctor'],
  APPOINTMENT_REMINDER: ['patient', 'doctor'],
  PAYMENT_SUCCESS: ['patient', 'receptionists'],
  PAYMENT_FAILED: ['patient'],
};

function keyMatches(given) {
  const expected = process.env.INTERNAL_EVENT_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!process.env.INTERNAL_EVENT_KEY) {
    return NextResponse.json({ error: 'Internal events are not configured (set INTERNAL_EVENT_KEY).' }, { status: 503 });
  }
  if (!keyMatches(req.headers.get('x-internal-key'))) {
    return NextResponse.json({ error: 'Invalid internal key.' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!RECIPIENTS[body.eventKey]) return NextResponse.json({ error: `Unsupported eventKey. Use one of: ${Object.keys(RECIPIENTS).join(', ')}.` }, { status: 400 });
  const appt = await appointmentModel.adminFindById(String(body.appointmentId || ''));
  if (!appt) return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 404 });

  const doctorFirst = appt.doctorName.replace(/^Dr\.?\s*/i, '');
  const data = {
    patient_name: appt.patientName, doctor_name: doctorFirst, hospital_name: appt.hospitalName, branch_name: appt.branchName || 'Main',
    appointment_id: appt.id, appointment_date: appt.date, appointment_time: appt.time,
    payment_amount: `₹${appt.fee}`, transaction_id: appt.transactionId || '',
  };
  const recipients = [];
  for (const who of RECIPIENTS[body.eventKey]) {
    if (who === 'patient') recipients.push(PATIENT);
    if (who === 'doctor') recipients.push(...(await notifications.doctorUsers(appt.doctorId)));
    if (who === 'receptionists') recipients.push(...(await notifications.hospitalUsers(appt.hospitalId, 'RECEPTIONIST')));
  }
  const results = await notifications.trigger(body.eventKey, recipients, data, { link: '/appointments' });
  return NextResponse.json({ ok: true, event: EVENTS[body.eventKey].name, delivered: results.filter((r) => r.ok).length, results });
}
