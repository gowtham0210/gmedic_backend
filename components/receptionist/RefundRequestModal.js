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

// Opened from the Payments page's vanilla-JS row template (public/js/pages/payments.js
// dispatches a "refund:request" CustomEvent with the appointment's details, since the
// table itself isn't React) — kept as its own component rather than folding the
// payments page into React, to avoid redesigning the rest of that page.
export default function RefundRequestModal() {
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onRequest(e) {
      setTarget(e.detail);
      setAmount(String(e.detail.fee ?? ''));
      setReason('');
      setErrors({});
      if (typeof window !== 'undefined' && window.G) window.G.modal.open('refund-request-modal');
    }
    window.addEventListener('refund:request', onRequest);
    return () => window.removeEventListener('refund:request', onRequest);
  }, []);

  function close() {
    if (typeof window !== 'undefined' && window.G) window.G.modal.close('refund-request-modal');
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/refunds', { method: 'POST', body: { appointmentId: target.appointmentId, amount, reason } });
      toast(res.message, 'success');
      close();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refund:requested'));
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" id="refund-request-modal" role="dialog" aria-modal="true" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="refresh" /></div>
            <div><h2>Request Refund</h2>{target && <p>{target.patientName} · {target.appointmentId}</p>}</div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className={`field${errors.amount ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
              <label>Amount (₹) *</label>
              <input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              {errors.amount && <p className="field__error">{errors.amount}</p>}
            </div>
            <div className={`field${errors.reason ? ' has-error' : ''}`}>
              <label>Reason *</label>
              <textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this patient being refunded?" required />
              {errors.reason && <p className="field__error">{errors.reason}</p>}
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Request Refund</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
