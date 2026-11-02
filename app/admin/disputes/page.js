'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import usePermissions from '../../../components/admin/usePermissions';
import Pager, { usePager } from '../../../components/admin/Pager';
import useHospitalOptions from '../../../components/admin/useHospitalOptions';
import { formatDateTime } from '../../../lib/format';

const STATUS_TONE = { OPEN: 'pending', UNDER_REVIEW: 'pending', RESOLVED: 'confirmed', REJECTED: 'cancelled' };
const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function ResolveModal({ target, onClose, onDone, canManage, threshold }) {
  const [status, setStatus] = useState('UNDER_REVIEW');
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState('');
  const loadNotes = useCallback(() => {
    if (target) api(`/api/admin/disputes/${target.id}/notes`).then((d) => setNotes(d.notes)).catch(() => {});
  }, [target]);
  // A fresh form for every dispute: the outcome, note and notes of the last one never carry over.
  useEffect(() => { setStatus('UNDER_REVIEW'); setResolution(''); setNote(''); setNotes([]); setSaving(false); loadNotes(); }, [loadNotes]);
  if (!target) return null;
  // What resolving in the patient's favour would refund: the disputed amount, capped by what is still refundable.
  const refundNow = Math.min(Number(target.amount), Number(target.refundable ?? target.amount));
  // A decided dispute is history: it opens read-only (outcome, who decided, the refund it created, the notes).
  const decided = target.status === 'RESOLVED' || target.status === 'REJECTED';

  async function addNote() {
    if (!note.trim()) return;
    try {
      const res = await api(`/api/admin/disputes/${target.id}/notes`, { method: 'POST', body: { note } });
      toast(res.message, 'success'); setNote(''); loadNotes();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/disputes/${target.id}/resolve`, { method: 'POST', body: { status, resolution } });
      toast(res.message, 'success');
      onDone();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-amber"><Icon name="alert-triangle" /></div>
            <div><h2>Dispute {target.id}</h2><p>{target.patientName} · {target.hospitalName} · {money(target.amount)}</p></div>
          </div>
          <div className="modal__body">
            {decided && (
              <dl className="kv" style={{ marginBottom: 14 }}>
                <div><dt>Outcome</dt><dd><span className={`badge badge--${STATUS_TONE[target.status]}`}>{target.status === 'RESOLVED' ? 'Resolved in the patient\'s favour' : 'Rejected'}</span></dd></div>
                <div><dt>Decided</dt><dd>{target.decidedAt ? formatDateTime(target.decidedAt) : '—'}{target.decidedBy ? ` by ${target.decidedBy}` : ''}</dd></div>
                <div className="kv--full"><dt>Resolution</dt><dd>{target.resolution || '—'}</dd></div>
                {target.status === 'RESOLVED' && <div className="kv--full"><dt>Refund</dt><dd>{target.refundId ? `${target.refundId} · ${money(target.refundAmount)}, deducted from the hospital's next settlement` : 'None: the payment had already been refunded in full.'}</dd></div>}
              </dl>
            )}
            {!decided && <div className="field" style={{ marginBottom: 14 }}>
              <label>Outcome</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="UNDER_REVIEW">Mark under review</option>
                <option value="RESOLVED">Resolve in the patient&apos;s favour</option>
                <option value="REJECTED">Reject the dispute (no refund)</option>
              </select>
              {status === 'RESOLVED' && (refundNow > 0
                ? (refundNow > threshold
                  ? <p className="field__hint is-warning"><Icon name="alert-triangle" className="icon--xs" />Refund of {money(refundNow)} is above the {money(threshold)} approval threshold: it is created pending, and two other admins must approve it on the Refunds page before it is paid.</p>
                  : <p className="field__hint is-warning"><Icon name="alert-triangle" className="icon--xs" />Refunds {money(refundNow)} to the patient.</p>)
                : <p className="field__hint">{target.paymentPurpose === 'TOKEN' ? 'No refund: the booking token is non-refundable.' : 'Nothing more can be refunded: this payment has already been refunded in full.'}</p>)}
              {status === 'REJECTED' && <p className="field__hint">The patient is not refunded.</p>}
            </div>}
            <dl className="kv" style={{ marginBottom: 14 }}>
              <div><dt>Transaction</dt><dd className="mono">{target.transactionId}</dd></div>
              <div><dt>Appointment</dt><dd className="mono">{target.appointmentId}</dd></div>
              <div className="kv--full"><dt>Reason raised</dt><dd>{target.reason}</dd></div>
            </dl>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Internal notes</label>
              {notes.map((n) => <p key={n.id} style={{ fontSize: 13, margin: '4px 0' }}><strong>{n.userName}:</strong> {n.note}</p>)}
              {notes.length === 0 && decided && <p className="text-muted" style={{ fontSize: 13 }}>No internal notes.</p>}
              {!decided && canManage && <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="input" placeholder="Add an internal note (not visible to the hospital)" value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="button" className="btn btn--ghost btn--sm" onClick={addNote}>Add</button>
              </div>}
            </div>
            {!decided && <div className="field"><label>Resolution note{status !== 'UNDER_REVIEW' ? ' *' : ''}</label><textarea className="textarea" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} required={status !== 'UNDER_REVIEW'} /></div>}
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>{decided ? 'Close' : 'Cancel'}</button>
            {!decided && <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}>Save</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

// Records a dispute against a paid payment (a patient complaint or a bank notice). Gateway chargebacks
// arrive through the webhook inbox instead.
function RaiseModal({ open, initialReference = '', onClose, onDone }) {
  const [form, setForm] = useState({ reference: initialReference, amount: '', reason: '' });
  useEffect(() => { if (open && initialReference) setForm((f) => ({ ...f, reference: initialReference })); }, [open, initialReference]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErrors({});
    try {
      const res = await api('/api/admin/disputes', { method: 'POST', body: form });
      toast(res.message, 'success'); setForm({ reference: '', amount: '', reason: '' }); onDone(); onClose();
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally { setSaving(false); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="raise-dispute-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-amber"><Icon name="alert-triangle" /></div>
            <div><h2 id="raise-dispute-title">Raise a dispute</h2><p>Against one paid payment. You decide it afterwards: in the patient&apos;s favour (refunds them) or rejected.</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className={`field${errors.reference ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
              <label>Payment, transaction or appointment ID *</label>
              <input className="input mono" value={form.reference} onChange={set('reference')} placeholder="e.g. PAY20431, TXN7361350820 or APT10525" required />
              {errors.reference && <p className="field__error">{errors.reference}</p>}
            </div>
            <div className={`field${errors.amount ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
              <label>Disputed amount (₹)</label>
              <input className="input" type="number" min="1" step="0.01" value={form.amount} onChange={set('amount')} placeholder="Leave empty for the full payment" />
              {errors.amount && <p className="field__error">{errors.amount}</p>}
            </div>
            <div className={`field${errors.reason ? ' has-error' : ''}`}>
              <label>Reason *</label>
              <textarea className="textarea" rows={3} maxLength={255} value={form.reason} onChange={set('reason')} placeholder="What the patient or the bank reported…" required />
              {errors.reason && <p className="field__error">{errors.reason}</p>}
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}>Raise Dispute</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DisputesPage() {
  const can = usePermissions();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const hospitals = useHospitalOptions();
  const [target, setTarget] = useState(null);
  const [showRaise, setShowRaise] = useState(false);
  const [raiseRef, setRaiseRef] = useState('');
  const [threshold, setThreshold] = useState(2000);
  // Linked from a payment (?raise=PAY…): open the form with that payment filled in.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('raise');
    if (ref) { setRaiseRef(ref); setShowRaise(true); }
  }, []);

  const [page, setPage] = usePager(JSON.stringify([status, q, hospitalId]));
  const [pages, setPages] = useState(1);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (q) qs.set('q', q);
      if (hospitalId) qs.set('hospitalId', hospitalId);
      qs.set('pageSize', '25');
      qs.set('page', String(page));
      const data = await api(`/api/admin/disputes?${qs}`);
      setItems(data.items);
      setTotal(data.total); setPages(data.pages || 1);
      if (data.refundThreshold != null) setThreshold(data.refundThreshold);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [status, q, hospitalId, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Disputes</h1>
          <p>Payment disputes and chargebacks raised against transactions.</p>
        </div>
        <div className="page-head__actions">
          {can('disputes.manage') && <button type="button" className="btn btn--primary" onClick={() => setShowRaise(true)}><Icon name="plus" />Raise Dispute</button>}
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Dispute, payment, transaction, appointment or patient" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Hospital</label>
            <select className="select" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
              <option value="">All</option>
              {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setStatus(''); setQ(''); setHospitalId(''); }}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Dispute</th><th>Patient</th><th>Hospital</th><th className="num">Amount</th><th>Reason</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="alert-triangle" /></div><h3>No disputes found</h3><p>Nothing has been disputed yet. Gateway chargebacks appear here; use Raise Dispute to record one yourself.</p></div></td></tr>
              )}
              {items.map((d) => (
                <tr key={d.id}>
                  <td data-label="Dispute" className="cell-primary mono">{d.id}</td>
                  <td data-label="Patient">{d.patientName}</td>
                  <td data-label="Hospital" className="text-muted">{d.hospitalName}</td>
                  <td data-label="Amount" className="num fee">{money(d.amount)}</td>
                  <td data-label="Reason" className="text-muted">{d.reason}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[d.status]}`}>{d.status.replace('_', ' ')}</span></td>
                  <td className="col-actions">
                    {d.status === 'RESOLVED' || d.status === 'REJECTED'
                      ? <button type="button" className="action-btn" onClick={() => setTarget(d)}><Icon name="eye" />View</button>
                      : can('disputes.manage') && <button type="button" className="action-btn" onClick={() => setTarget(d)}><Icon name="pencil" />Decide</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} pages={pages} noun="dispute" onPage={setPage} />
      </article>

      <RaiseModal open={showRaise} initialReference={raiseRef} onClose={() => setShowRaise(false)} onDone={load} />
      <ResolveModal target={target} onClose={() => setTarget(null)} onDone={load} canManage={can('disputes.manage')} threshold={threshold} />
    </>
  );
}
