// Every notification event the platform can raise. A template is attached to an
// event by event_key; it may only use the variables listed for that event
// (enforced when a template is saved). `sample` feeds the editor's preview.

const COMMON_APPT = ['patient_name', 'doctor_name', 'hospital_name', 'branch_name', 'appointment_id', 'appointment_date', 'appointment_time'];
const SAMPLE_APPT = {
  patient_name: 'Rahul Kumar', doctor_name: 'Arun Srinivasan', hospital_name: 'Sunrise General Hospital', branch_name: 'Main Branch',
  appointment_id: 'APT10555', appointment_date: '2026-10-05', appointment_time: '10:30 AM',
};

const EVENTS = {
  APPOINTMENT_CONFIRMED: { name: 'Appointment Confirmed', audience: 'Patient', variables: COMMON_APPT, sample: SAMPLE_APPT,
    title: 'Appointment Confirmed', body: 'Hi {{patient_name}}, your appointment with Dr. {{doctor_name}} at {{hospital_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. Appointment ID: {{appointment_id}}.' },
  APPOINTMENT_CANCELLED: { name: 'Appointment Cancelled', audience: 'Patient, Receptionist', variables: COMMON_APPT, sample: SAMPLE_APPT,
    title: 'Appointment Cancelled', body: 'The appointment {{appointment_id}} for {{patient_name}} with Dr. {{doctor_name}} on {{appointment_date}} at {{appointment_time}} has been cancelled.' },
  APPOINTMENT_RESCHEDULED: { name: 'Appointment Rescheduled', audience: 'Patient, Doctor, Receptionist', variables: COMMON_APPT, sample: SAMPLE_APPT,
    title: 'Appointment Rescheduled', body: 'The appointment {{appointment_id}} for {{patient_name}} with Dr. {{doctor_name}} has been moved to {{appointment_date}} at {{appointment_time}}.' },
  APPOINTMENT_REMINDER: { name: 'Appointment Reminder', audience: 'Patient, Doctor', variables: COMMON_APPT, sample: SAMPLE_APPT,
    title: 'Appointment Reminder', body: 'Reminder: appointment {{appointment_id}} with Dr. {{doctor_name}} at {{hospital_name}} is on {{appointment_date}} at {{appointment_time}}.' },
  NEW_APPOINTMENT: { name: 'New Appointment', audience: 'Doctor, Receptionist', variables: COMMON_APPT, sample: SAMPLE_APPT,
    title: 'New Appointment', body: 'New appointment {{appointment_id}}: {{patient_name}} with Dr. {{doctor_name}} on {{appointment_date}} at {{appointment_time}}.' },
  PAYMENT_SUCCESS: { name: 'Payment Successful', audience: 'Patient, Receptionist', variables: [...COMMON_APPT, 'payment_amount', 'transaction_id'],
    sample: { ...SAMPLE_APPT, payment_amount: '₹800', transaction_id: 'TXN5370081891' },
    title: 'Payment Successful', body: 'Payment of {{payment_amount}} (transaction {{transaction_id}}) received for appointment {{appointment_id}} with Dr. {{doctor_name}}.' },
  PAYMENT_FAILED: { name: 'Payment Failed', audience: 'Patient', variables: [...COMMON_APPT, 'payment_amount', 'transaction_id'],
    sample: { ...SAMPLE_APPT, payment_amount: '₹800', transaction_id: 'TXN5370081891' },
    title: 'Payment Failed', body: 'Your payment of {{payment_amount}} for appointment {{appointment_id}} did not go through. Please try again.' },
  REFUND_REQUESTED: { name: 'Refund Requested', audience: 'Super Admin', variables: ['refund_id', 'refund_amount', 'patient_name', 'hospital_name', 'appointment_id', 'requested_by'],
    sample: { refund_id: 'REF3', refund_amount: '₹700', patient_name: 'Rahul Kumar', hospital_name: 'Sunrise General Hospital', appointment_id: 'APT10555', requested_by: 'Riya Sharma' },
    title: 'Refund Requested', body: '{{requested_by}} requested a refund of {{refund_amount}} ({{refund_id}}) for {{patient_name}} at {{hospital_name}}.' },
  REFUND_APPROVED: { name: 'Refund Approved', audience: 'Requester', variables: ['refund_id', 'refund_amount', 'patient_name', 'appointment_id'],
    sample: { refund_id: 'REF3', refund_amount: '₹700', patient_name: 'Rahul Kumar', appointment_id: 'APT10555' },
    title: 'Refund Approved', body: 'Refund {{refund_id}} of {{refund_amount}} for {{patient_name}} ({{appointment_id}}) was approved.' },
  REFUND_REJECTED: { name: 'Refund Rejected', audience: 'Requester', variables: ['refund_id', 'refund_amount', 'patient_name', 'appointment_id', 'decision_note'],
    sample: { refund_id: 'REF3', refund_amount: '₹700', patient_name: 'Rahul Kumar', appointment_id: 'APT10555', decision_note: 'Visit already completed' },
    title: 'Refund Rejected', body: 'Refund {{refund_id}} of {{refund_amount}} for {{patient_name}} ({{appointment_id}}) was rejected. {{decision_note}}' },
  DOCTOR_AVAILABILITY_UPDATED: { name: 'Doctor Availability Updated', audience: 'Receptionist', variables: ['doctor_name', 'availability', 'hospital_name'],
    sample: { doctor_name: 'Arun Srinivasan', availability: 'Unavailable', hospital_name: 'Sunrise General Hospital' },
    title: 'Doctor Availability Updated', body: 'Dr. {{doctor_name}} is now {{availability}}.' },
  DOCTOR_LEAVE_CHANGED: { name: 'Doctor Leave Changed', audience: 'Receptionist', variables: ['doctor_name', 'leave_change', 'leave_dates', 'booked_summary'],
    sample: { doctor_name: 'Arun Srinivasan', leave_change: 'leave added', leave_dates: '14 Oct – 16 Oct 2026', booked_summary: '3 booked appointments need to be moved or cancelled.' },
    title: 'Doctor Leave', body: 'Dr. {{doctor_name}}: {{leave_change}} ({{leave_dates}}). {{booked_summary}}' },
  TOKEN_GENERATED: { name: 'Token Generated', audience: 'Doctor', variables: ['token_number', 'patient_name', 'doctor_name', 'appointment_id', 'appointment_date'],
    sample: { token_number: 'T004', patient_name: 'Rahul Kumar', doctor_name: 'Arun Srinivasan', appointment_id: 'APT10555', appointment_date: '2026-10-05' },
    title: 'Token Generated', body: 'Token {{token_number}} was issued to {{patient_name}} for appointment {{appointment_id}}.' },
  TOKEN_UPDATED: { name: 'Token Updated', audience: 'Receptionist', variables: ['token_number', 'token_status', 'patient_name', 'doctor_name'],
    sample: { token_number: 'T004', token_status: 'In Consultation', patient_name: 'Rahul Kumar', doctor_name: 'Arun Srinivasan' },
    title: 'Token Updated', body: 'Token {{token_number}} ({{patient_name}}) is now {{token_status}} with Dr. {{doctor_name}}.' },
  SUPPORT_TICKET_CREATED: { name: 'Support Ticket Created', audience: 'Super Admin / Support', variables: ['support_ticket_id', 'ticket_subject', 'raised_by', 'raised_by_role'],
    sample: { support_ticket_id: 'SUP-1051', ticket_subject: 'QR code not scanning', raised_by: 'Riya Sharma', raised_by_role: 'Receptionist' },
    title: 'New Support Ticket', body: '{{raised_by}} ({{raised_by_role}}) opened {{support_ticket_id}}: {{ticket_subject}}.' },
  SUPPORT_TICKET_UPDATED: { name: 'Support Ticket Updated', audience: 'Ticket owner', variables: ['support_ticket_id', 'ticket_subject', 'ticket_status', 'update_summary'],
    sample: { support_ticket_id: 'SUP-1051', ticket_subject: 'QR code not scanning', ticket_status: 'In Progress', update_summary: 'Support replied' },
    title: 'Support Ticket Updated', body: '{{support_ticket_id}} ({{ticket_subject}}): {{update_summary}}. Status: {{ticket_status}}.' },
  SUPPORT_TICKET_RESOLVED: { name: 'Support Ticket Resolved', audience: 'Ticket owner', variables: ['support_ticket_id', 'ticket_subject'],
    sample: { support_ticket_id: 'SUP-1051', ticket_subject: 'QR code not scanning' },
    title: 'Support Ticket Resolved', body: 'Your ticket {{support_ticket_id}} ({{ticket_subject}}) has been resolved.' },
};

// Messages people rely on: turning one off means patients or staff stop being told something that matters.
const CRITICAL = new Set(['APPOINTMENT_CONFIRMED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_RESCHEDULED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_REJECTED']);
const isCritical = (eventKey) => CRITICAL.has(eventKey);

const CHANNELS = {
  IN_APP: { label: 'In-App', available: true },
  PUSH: { label: 'Push', available: false, note: 'Push provider not configured' },
  SMS: { label: 'SMS', available: false, note: 'SMS provider not configured' },
  WHATSAPP: { label: 'WhatsApp', available: false, note: 'WhatsApp provider not configured' },
  EMAIL: { label: 'Email', available: false, note: 'Email provider not configured' },
};

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function variablesIn(text) {
  return [...String(text || '').matchAll(VAR_RE)].map((m) => m[1]);
}

// Returns the list of variables in title/body that the event doesn't provide.
function invalidVariables(eventKey, ...texts) {
  const event = EVENTS[eventKey];
  if (!event) return [];
  const allowed = new Set(event.variables);
  return [...new Set(texts.flatMap(variablesIn))].filter((v) => !allowed.has(v));
}

function render(text, data) {
  return String(text || '').replace(VAR_RE, (_, name) => (data && data[name] != null && data[name] !== '' ? String(data[name]) : '—'));
}

module.exports = { EVENTS, CHANNELS, isCritical, variablesIn, invalidVariables, render };
