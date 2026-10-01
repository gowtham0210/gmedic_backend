'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

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

function ResolveModal({ target, onClose, onDone }) {
  const [status, setStatus] = useState('UNDER_REVIEW');
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;

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
            <div><h2>Dispute {target.id}</h2><p>{target.patientName} · {money(target.amount)}</p></div>
          </div>
          <div className="modal__body">
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Outcome</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="UNDER_REVIEW">Mark under review</option>
                <option value="RESOLVED">Resolve (in patient&apos;s favor)</option>
                <option value="REJECTED">Reject dispute</option>
              </select>
            </div>
            <div className="field"><label>Resolution note{status !== 'UNDER_REVIEW' ? ' *' : ''}</label><textarea className="textarea" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} required={status !== 'UNDER_REVIEW'} /></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DisputesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [target, setTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      qs.set('pageSize', '25');
      const data = await api(`/api/admin/disputes?${qs}`);
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
          <h1>Disputes</h1>
          <p>Payment disputes and chargebacks raised against transactions.</p>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
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
          <button type="button" className="btn btn--ghost" onClick={() => setStatus('')}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Dispute</th><th>Patient</th><th>Hospital</th><th>Amount</th><th>Reason</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="alert-triangle" /></div><h3>No disputes found</h3><p>Nothing has been disputed yet.</p></div></td></tr>
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
                    {d.status !== 'RESOLVED' && d.status !== 'REJECTED' && <button type="button" className="action-btn" onClick={() => setTarget(d)}><Icon name="pencil" />Decide</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} dispute{total === 1 ? '' : 's'}</span></div>
      </article>

      <ResolveModal target={target} onClose={() => setTarget(null)} onDone={load} />
    </>
  );
}
