'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from '../../../components/Icon';
import usePermissions from '../../../components/admin/usePermissions';
import Pager, { usePager } from '../../../components/admin/Pager';
import useHospitalOptions from '../../../components/admin/useHospitalOptions';

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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // A fresh form for every refund and decision: a reason typed for the last one never carries over.
  useEffect(() => { setNote(''); setError(''); setSaving(false); }, [target && target.refund.id, target && target.decision]);
  if (!target) return null;
  const { refund, decision } = target;
  const rejecting = decision === 'REJECTED';
  const firstOfTwo = !rejecting && refund.requiresChecker && !refund.firstApprovedById;

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api(`/api/admin/refunds/${refund.id}/decision`, { method: 'POST', body: { decision, note } });
      toast(res.message, 'success');
      setNote(''); onDone(); onClose();
    } catch (err) {
      if (err.fields && err.fields.note) setError(err.fields.note); else toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="refund-decision-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className={`modal__icon ${rejecting ? 'tone-red' : 'tone-green'}`}><Icon name={rejecting ? 'alert' : 'check-circle'} /></div>
            <div><h2 id="refund-decision-title">{rejecting ? 'Reject' : 'Approve'} refund of {money(refund.amount)}?</h2><p>{refund.patientName} · {refund.hospitalName}</p>
              {refund.requiresChecker && !rejecting && <p className="text-muted">{firstOfTwo ? 'Above the auto-approval threshold: this is approval 1 of 2. The refund stays pending until a different admin approves it too.' : `Approval 2 of 2: ${refund.firstApprovedBy || 'another admin'} approved it first. Approving now pays the refund.`}</p>}
            </div>
          </div>
          <div className="modal__body">
            <div className={`field${error ? ' has-error' : ''}`}>
              <label>{rejecting ? 'Reason *' : 'Note'}</label>
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} required={rejecting}
                placeholder={rejecting ? 'Why is this refund rejected? The requester is shown this…' : 'Add a note about this approval (optional)…'} />
              {error && <p className="field__error">{error}</p>}
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${rejecting ? 'btn--danger' : 'btn--primary'}${saving ? ' is-loading' : ''}`} disabled={saving}>{rejecting ? 'Reject Refund' : firstOfTwo ? 'Give First Approval' : 'Approve Refund'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
function RefundsPage() {
  const can = usePermissions();
  // Filters can be preset from the URL, e.g. the dashboard's "needs attention" links.
  const params = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(() => params.get('status') || '');
  const [q, setQ] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const hospitals = useHospitalOptions();
  const [me, setMe] = useState('');
  const [decisionTarget, setDecisionTarget] = useState(null);

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
      const data = await api(`/api/admin/refunds?${qs}`);
      setItems(data.items);
      setTotal(data.total); setPages(data.pages || 1); setMe(data.me || '');
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
          <h1>Refunds</h1>
          <p>Refund requests and their approvals. Gmedic only takes the booking token online, which is never refunded, so no new refunds are issued here; consultation fees paid at the hospital are returned by the hospital.</p>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Refund, appointment, patient or transaction" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setStatus(''); setQ(''); setHospitalId(''); }}><Icon name="refresh" />Reset</button>
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
                  <td data-label="Refund" className="cell-primary mono">{r.id}{r.disputeId && <span className="cell-sub">dispute {r.disputeId}</span>}{r.requestedBy && <span className="cell-sub">by {r.requestedBy}</span>}</td>
                  <td data-label="Patient">{r.patientName}</td>
                  <td data-label="Hospital" className="text-muted">{r.hospitalName}</td>
                  <td data-label="Amount" className="num fee">{money(r.amount)}</td>
                  <td data-label="Reason" className="text-muted">{r.reason}{r.decisionNote && <span className="cell-sub">{r.status === 'REJECTED' ? 'Rejected: ' : 'Note: '}{r.decisionNote}</span>}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[r.status] || 'neutral'}`}>{r.status}</span>{r.status === 'PENDING' && r.requiresChecker && <span className="cell-sub">{r.approvalsGiven} of 2 approvals{r.firstApprovedBy ? ` · ${r.firstApprovedBy}` : ''}</span>}</td>
                  <td className="col-actions">
                    {can('refunds.approve') && r.status === 'PENDING' && (
                      <div className="action-group">
                        {(() => {
                          // Above the threshold the requester and the first approver can't approve again.
                          const blocked = r.requiresChecker && (r.requestedById === me || r.firstApprovedById === me);
                          const why = r.requestedById === me ? 'You requested this refund, so another admin must approve it.' : 'You gave the first approval; a different admin must give the second.';
                          return <button type="button" className="action-btn" disabled={blocked} title={blocked ? why : undefined} onClick={() => setDecisionTarget({ refund: r, decision: 'APPROVED' })}><Icon name="check" />{r.requiresChecker && !r.firstApprovedById ? 'Approve (1 of 2)' : 'Approve'}</button>;
                        })()}
                        <button type="button" className="action-btn" onClick={() => setDecisionTarget({ refund: r, decision: 'REJECTED' })}><Icon name="x" />Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} pages={pages} noun="refund" onPage={setPage} />
      </article>

      <DecisionModal target={decisionTarget} onClose={() => setDecisionTarget(null)} onDone={load} />
    </>
  );
}

// useSearchParams needs a Suspense boundary for the production build.
export default function RefundsPageRoute() {
  return <Suspense fallback={null}><RefundsPage /></Suspense>;
}
