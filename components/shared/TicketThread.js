'use client';

const ROLE_LABEL = { PATIENT: 'Patient', DOCTOR: 'Doctor', RECEPTIONIST: 'Receptionist', ADMIN: 'Staff', SUPPORT: 'Gmedic Support' };

// Conversation timeline for a support ticket. `viewerSide` is the role whose
// messages should be shown as "mine" (right-aligned): the ticket owner's role
// in a portal, or 'SUPPORT' in the Super Admin console.
export default function TicketThread({ messages, viewerSide }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {messages.map((m) => {
        const mine = (viewerSide === 'SUPPORT') === (m.senderRole === 'SUPPORT');
        return (
          <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 3, textAlign: mine ? 'right' : 'left' }}>
              <strong>{m.senderName}</strong> · {ROLE_LABEL[m.senderRole] || m.senderRole} · <time suppressHydrationWarning>{new Date(m.createdAt).toLocaleString()}</time>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 12, background: mine ? 'var(--teal-50)' : 'var(--surface-2)', border: '1px solid var(--border-2)', whiteSpace: 'pre-wrap', fontSize: 14 }}>
              {m.message}
            </div>
          </div>
        );
      })}
    </div>
  );
}
