import Icon from '../Icon';

// The hospital's real Gmedic status for the front desk (Super Admin sets it), with why bookings
// may be blocked. `notice` adds the explanation under the badge.
const COPY = {
  ACTIVE: { badge: 'badge--confirmed', label: 'Active on Gmedic', note: null },
  ONBOARDING: { badge: 'badge--pending', label: 'Onboarding', note: 'Gmedic is still setting up this hospital, so patients and the front desk can’t book yet. Contact Gmedic support if this is taking long.' },
  SUSPENDED: { badge: 'badge--cancelled', label: 'Suspended', note: 'Gmedic has paused bookings for this hospital. Existing appointments and history are kept. Contact Gmedic support to resolve it.' },
  OFFBOARDED: { badge: 'badge--cancelled', label: 'Offboarded', note: 'This hospital has left Gmedic. New bookings are closed.' },
};

export function HospitalStatusBadge({ hospital }) {
  const c = COPY[hospital.status] || COPY.ONBOARDING;
  return <span className={`badge ${c.badge}`}>{c.label}</span>;
}

export function HospitalStatusNotice({ hospital, style }) {
  const c = COPY[hospital.status] || COPY.ONBOARDING;
  if (!c.note) return null;
  return (
    <div className="alert alert--warning" style={style}>
      <Icon name="alert" />
      <span><strong>{c.label}.</strong> {c.note}{hospital.statusReason ? ` Reason: ${hospital.statusReason}` : ''}</span>
    </div>
  );
}

export function NoActiveQr({ compact = false }) {
  return (
    <div className="alert alert--warning" style={compact ? undefined : { margin: '8px 0 16px' }}>
      <Icon name="qr-code" />
      <span><strong>No active QR code.</strong> The hospital&apos;s QR code was revoked, so there is nothing to display or print. Contact Gmedic support to issue a new one.</span>
    </div>
  );
}
