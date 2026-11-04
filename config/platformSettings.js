// The platform settings an admin may change, with what each one does and the range it accepts. Anything
// not listed here is rejected (controllers/admin/settingsController.js). `default` is used when no row exists.

const SETTINGS = {
  booking_token_amount: {
    label: 'Booking token', unit: '₹', min: 1, max: 100, default: 5,
    help: 'What a patient pays in the Gmedic app to confirm a booking, at every hospital. Gmedic keeps it and it is never refunded; the consultation fee is paid at the hospital.',
  },
  booking_window_days: {
    label: 'Booking window', unit: 'days', min: 1, max: 90, default: 14,
    help: 'How many days ahead patients can book, for hospitals that have not set their own booking policy. New hospitals start with this value.',
  },
  appointment_hold_minutes: {
    label: 'Appointment hold time', unit: 'minutes', min: 1, max: 60, default: 10,
    help: 'How long a seat is held while a patient pays. A very short hold makes payments fail.',
  },
  cancellation_cutoff_hours: {
    label: 'Cancellation cutoff', unit: 'hours before the appointment', min: 0, max: 168, default: 2,
    help: 'Not used while the booking token is non-refundable (it decided refunds for cancellations). Kept for hospital booking policies.',
  },
  no_show_grace_minutes: {
    label: 'No-show grace period', unit: 'minutes after the slot starts', min: 0, max: 240, default: 15,
    help: 'A booked patient can be marked a no-show only after this long past the slot start.',
  },
  emergency_walkin_warning_threshold: {
    label: 'Emergency walk-in workload warning', unit: 'active walk-ins', min: 1, max: 500, default: 10,
    help: 'When this many emergency walk-ins are active at a hospital, the front desk sees a workload warning with the hospital\'s escalation instructions. It is only a warning: it never refuses a registration. Nothing needs to be set for emergency walk-ins to work.',
  },
  refund_maker_checker_threshold: {
    label: 'Refund approval threshold', unit: '₹', min: 0, max: 1000000, default: 2000,
    help: 'Refunds above this amount need approval from two different admins, neither of them the requester.',
  },
};

module.exports = { SETTINGS };
