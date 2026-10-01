'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

const STATUS_TONE = { OPEN: 'pending', IN_PROGRESS: 'pending', RESOLVED: 'confirmed', CLOSED: 'neutral' };
const PRIORITY_TONE = { LOW: 'neutral', MEDIUM: 'pending', HIGH: 'cancelled', URGENT: 'cancelled' };
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

function CreateModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ source: 'INTERNAL', category: 'OTHER', subject: '', description: '', priority: 'MEDIUM' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/admin/support', { method: 'POST', body: form });
      toast(res.message, 'success');
      onCreated();
      onClose();
      setForm({ source: 'INTERNAL', category: 'OTHER', subject: '', description: '', priority: 'MEDIUM' });
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="life-buoy" /></div>
            <div><h2>New Ticket</h2></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className="field">
                <label>Source</label>
                <select className="select" value={form.source} onChange={set('source')}>
                  {['PATIENT_APP', 'HOSPITAL', 'EMAIL', 'PHONE', 'INTERNAL'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Category</label>
                <select className="select" value={form.category} onChange={set('category')}>
                  {['BOOKING', 'PAYMENT', 'REFUND', 'QR', 'ACCOUNT', 'TECHNICAL', 'OTHER'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select className="select" value={form.priority} onChange={set('priority')}>
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className={`field field--full${errors.subject ? ' has-error' : ''}`}>
                <label>Subject *</label>
                <input className="input" value={form.subject} onChange={set('subject')} required />
                {errors.subject && <p className="field__error">{errors.subject}</p>}
              </div>
              <div className={`field field--full${errors.description ? ' has-error' : ''}`}>
                <label>Description *</label>
                <textarea className="textarea" rows={4} value={form.description} onChange={set('description')} required />
                {errors.description && <p className="field__error">{errors.description}</p>}
              </div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Create</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SupportPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (priority) qs.set('priority', priority);
      if (q) qs.set('q', q);
      qs.set('pageSize', '25');
      const data = await api(`/api/admin/support?${qs}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [status, priority, q]);

  useEffect(() => { load(); }, [load]);

  async function setTicketStatus(id, next) {
    try {
      const res = await api(`/api/admin/support/${id}/status`, { method: 'PATCH', body: { status: next } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support</h1>
          <p>Tickets raised by hospitals and patients, with SLA tracking.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowCreate(true)}><Icon name="plus" />New Ticket</button>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Subject or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Priority</label>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setStatus(''); setPriority(''); }}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Ticket</th><th>Category</th><th>Hospital</th><th>Priority</th><th>SLA due</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="life-buoy" /></div><h3>No tickets found</h3></div></td></tr>
              )}
              {items.map((t) => (
                <tr key={t.id}>
                  <td data-label="Ticket" className="cell-primary">{t.subject}<span className="cell-sub mono">{t.id}</span></td>
                  <td data-label="Category">{t.category}</td>
                  <td data-label="Hospital" className="text-muted">{t.hospitalName || '—'}</td>
                  <td data-label="Priority"><span className={`badge badge--${PRIORITY_TONE[t.priority]}`}>{t.priority}</span></td>
                  <td data-label="SLA due" className="text-muted mono">{t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : '—'}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[t.status]}`}>{t.status.replace('_', ' ')}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      {t.status === 'OPEN' && <button type="button" className="action-btn" onClick={() => setTicketStatus(t.id, 'IN_PROGRESS')}><Icon name="clock" />Start</button>}
                      {t.status !== 'RESOLVED' && t.status !== 'CLOSED' && <button type="button" className="action-btn" onClick={() => setTicketStatus(t.id, 'RESOLVED')}><Icon name="check" />Resolve</button>}
                      {t.status === 'RESOLVED' && <button type="button" className="action-btn" onClick={() => setTicketStatus(t.id, 'CLOSED')}><Icon name="x" />Close</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} ticket{total === 1 ? '' : 's'}</span></div>
      </article>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </>
  );
}
