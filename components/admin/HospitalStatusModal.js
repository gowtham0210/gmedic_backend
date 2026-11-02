'use client';

import { useEffect, useState } from 'react';
import Icon from '../Icon';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const COPY = {
  ACTIVE: { verb: 'Activate', icon: 'check-circle', tone: 'tone-green', body: 'Patients can book with this hospital again.' },
  SUSPENDED: { verb: 'Suspend', icon: 'ban', tone: 'tone-red', body: 'New bookings are blocked. Staff can still sign in, and historical appointments and payments are kept.' },
  OFFBOARDED: { verb: 'Offboard', icon: 'alert', tone: 'tone-red', body: 'This is final. Bookings stop for good; appointments, payments and the audit history are kept.' },
};

// Confirms a hospital status change (list row or detail page). Suspending and offboarding need a
// reason; offboarding also shows how many staff logins and QR codes it will lock.
export default function HospitalStatusModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [impact, setImpact] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason(''); setError(''); setImpact(null);
    if (target && target.status === 'OFFBOARDED') {
      api(`/api/admin/hospitals/${target.hospital.id}/offboard-impact`).then(setImpact).catch(() => {});
    }
  }, [target]);

  if (!target) return null;
  const { hospital, status } = target;
  const copy = COPY[status];
  const needsReason = status === 'SUSPENDED' || status === 'OFFBOARDED';

  async function submit(e) {
    e.preventDefault();
    if (needsReason && !reason.trim()) return setError('Enter a reason.');
    setSaving(true);
    try {
      const res = await api(`/api/admin/hospitals/${hospital.id}/status`, { method: 'PATCH', body: { status, reason } });
      toast(res.message, 'success');
      onDone(res.hospital);
      onClose();
    } catch (err) {
      if (err.fields && err.fields.reason) setError(err.fields.reason);
      else toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="hospital-status-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit} noValidate>
          <div className="modal__head">
            <div className={`modal__icon ${copy.tone}`}><Icon name={copy.icon} /></div>
            <div><h2 id="hospital-status-title">{copy.verb} {hospital.name}?</h2><p>{copy.body}</p></div>
          </div>
          <div className="modal__body">
            {status === 'OFFBOARDED' && (
              <p className="note" style={{ marginTop: 0, marginBottom: 14 }}><Icon name="info" />
                <span>{impact
                  ? `${impact.activeStaffLogins} staff login${impact.activeStaffLogins === 1 ? '' : 's'} will be deactivated and ${impact.activeQrCodes} QR code${impact.activeQrCodes === 1 ? '' : 's'} revoked.`
                  : 'Checking staff logins and QR codes…'}</span>
              </p>
            )}
            {needsReason && (
              <div className={`field${error ? ' has-error' : ''}`}>
                <label>Reason *</label>
                <textarea className="textarea" value={reason} rows={3} maxLength={300} onChange={(e) => { setReason(e.target.value); setError(''); }}
                  placeholder={status === 'SUSPENDED' ? 'Enter the reason for suspending this hospital…' : 'Enter the reason for offboarding this hospital…'} />
                {error && <p className="field__error">{error}</p>}
              </div>
            )}
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${status === 'ACTIVE' ? 'btn--primary' : 'btn--danger'}${saving ? ' is-loading' : ''}`} disabled={saving}>{copy.verb} Hospital</button>
          </div>
        </form>
      </div>
    </div>
  );
}
