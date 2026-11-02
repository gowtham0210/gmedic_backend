// What each portal user may switch off in their bell, by role. Each preference covers one or more
// notification events (config/notificationEvents.js). Events that aren't listed here can't be muted:
// for a doctor that is a cancelled or moved appointment (they would wait for a patient who isn't
// coming). Everything is on until the user turns it off; only their choices are stored
// (user_notification_prefs).

const PREFERENCES = {
  DOCTOR: [
    { key: 'new_appointments', label: 'New appointments', help: 'When a patient or the front desk books you.', events: ['NEW_APPOINTMENT'] },
    { key: 'queue_tokens', label: 'Queue tokens', help: 'When the front desk checks a patient in for you.', events: ['TOKEN_GENERATED'] },
    { key: 'reminders', label: 'Appointment reminders', help: 'A reminder before an appointment, when one is sent.', events: ['APPOINTMENT_REMINDER'] },
    { key: 'support', label: 'Support replies', help: 'When Gmedic Support answers, updates or resolves one of your tickets.', events: ['SUPPORT_TICKET_UPDATED', 'SUPPORT_TICKET_RESOLVED'] },
  ],
};

// Always delivered, shown on the settings screen so it's clear why they can't be switched off.
const ALWAYS_ON = {
  DOCTOR: [{ label: 'Cancelled or moved appointments', help: 'Always on, so you never wait for a patient who isn’t coming.' }],
};

const forRole = (role) => PREFERENCES[role] || [];

// The preference key that covers `eventKey` for `role`, or null when it can't be muted.
function prefKeyFor(role, eventKey) {
  const p = forRole(role).find((x) => x.events.includes(eventKey));
  return p ? p.key : null;
}

module.exports = { PREFERENCES, ALWAYS_ON, forRole, prefKeyFor };
