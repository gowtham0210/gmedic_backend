'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

const STATUS_TONE = { PENDING: 'pending', APPROVED: 'confirmed', PROCESSING: 'pending', COMPLETED: 'confirmed', REJECTED: 'cancelled' };
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

function DecisionModal({ target, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  const { refund, decision } = target;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/refunds/${refund.id}/decision`, { method: 'POST', body: { decision, note } });
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
            <div className={`modal__icon ${decision === 'APPROVED' ? 'tone-green' : 'tone-red'}`}><Icon name={decision === 'APPROVED' ? 'check-circle' : 'alert'} /></div>
            <div><h2>{decision === 'APPROVED' ? 'Approve' : 'Reject'} refund of {money(refund.amount)}?</h2><p>{refund.patientName} · {refund.hospitalName}</p>
              {refund.requiresChecker && <p className="text-muted">Above the auto-approval threshold — requires a different admin than the requester.</p>}
            </div>
          </div>
          <div className="modal__body">
            <div className="field"><label>Note</label><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder={decision === 'APPROVED' ? 'Add a note about this approval (optional)…' : 'Add a note about why this refund is rejected (optional)…'} /></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${decision === 'APPROVED' ? 'btn--primary' : 'btn--danger'}${saving ? ' is-loading' : ''}`} disabled={saving}>{decision === 'APPROVED' ? 'Approve Refund' : 'Reject Refund'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RefundsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [decisionTarget, setDecisionTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      qs.set('pageSize', '25');
      const data = await api(`/api/admin/refunds?${qs}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Refunds</h1>
          <p>Approve or reject refund requests raised by hospital receptionists. Amounts above the threshold need a second admin&apos;s sign-off.</p>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => setStatus('')}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Refund</th><th>Patient</th><th>Hospital</th><th className="num">Amount</th><th>Reason</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="refresh" /></div><h3>No refunds found</h3></div></td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td data-label="Refund" className="cell-primary mono">{r.id}{r.requiresChecker && <span className="cell-sub">needs 2nd approver</span>}</td>
                  <td data-label="Patient">{r.patientName}</td>
                  <td data-label="Hospital" className="text-muted">{r.hospitalName}</td>
                  <td data-label="Amount" className="num fee">{money(r.amount)}</td>
                  <td data-label="Reason" className="text-muted">{r.reason}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[r.status] || 'neutral'}`}>{r.status}</span></td>
                  <td className="col-actions">
                    {r.status === 'PENDING' && (
                      <div className="action-group">
                        <button type="button" className="action-btn" onClick={() => setDecisionTarget({ refund: r, decision: 'APPROVED' })}><Icon name="check" />Approve</button>
                        <button type="button" className="action-btn" onClick={() => setDecisionTarget({ refund: r, decision: 'REJECTED' })}><Icon name="x" />Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} refund{total === 1 ? '' : 's'}</span></div>
      </article>

      <DecisionModal target={decisionTarget} onClose={() => setDecisionTarget(null)} onDone={load} />
    </>
  );
}
