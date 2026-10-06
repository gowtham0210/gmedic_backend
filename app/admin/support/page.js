'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import TicketThread from '../../../components/shared/TicketThread';

const STATUS_TONE = { OPEN: 'pending', IN_PROGRESS: 'pending', RESOLVED: 'confirmed', CLOSED: 'neutral' };
const PRIORITY_TONE = { LOW: 'neutral', MEDIUM: 'pending', HIGH: 'cancelled', URGENT: 'cancelled' };
const SOURCE_LABEL = { PATIENT: 'Patient', DOCTOR: 'Doctor', RECEPTIONIST: 'Receptionist', ADMIN: 'Staff' };
const CATEGORY_LABEL = { APPOINTMENT: 'Appointment', PAYMENT: 'Payment', REFUND: 'Refund', HOSPITAL: 'Hospital', DOCTOR: 'Doctor', ACCOUNT: 'Account', QR: 'QR / Scanning', SCHEDULE: 'Schedule', TECHNICAL: 'Technical issue', OTHER: 'Other' };
const NEXT_ACTIONS = {
  OPEN: [['IN_PROGRESS', 'Mark In Progress'], ['RESOLVED', 'Resolve Ticket']],
  IN_PROGRESS: [['RESOLVED', 'Resolve Ticket']],
  RESOLVED: [['CLOSED', 'Close Ticket'], ['IN_PROGRESS', 'Reopen']],
  CLOSED: [],
};
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

function TicketDrawer({ ticketId, assignees, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api(`/api/admin/support/${ticketId}`)); } catch (err) { toast(err.message, 'error'); onClose(); }
  }, [ticketId, onClose]);
  useEffect(() => { load(); }, [load]);

  async function run(fn, successRefresh = true) {
    setBusy(true);
    try { const res = await fn(); if (res && res.message) toast(res.message, 'success'); if (successRefresh) { await load(); onChanged(); } return res; }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  const send = (e) => { e.preventDefault(); run(async () => { const res = await api(`/api/admin/support/${ticketId}/messages`, { method: 'POST', body: { message: reply } }); setReply(''); return res; }); };
  const setStatus = (status) => run(() => api(`/api/admin/support/${ticketId}/status`, { method: 'PATCH', body: { status } }));
  const setPriority = (priority) => run(() => api(`/api/admin/support/${ticketId}/priority`, { method: 'PATCH', body: { priority } }));
  const assign = (assignedTo) => run(() => api(`/api/admin/support/${ticketId}/assign`, { method: 'PATCH', body: { assignedTo: assignedTo || null } }));

  const t = data && data.ticket;
  return (
    <div className="modal modal--drawer" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--drawer" style={{ width: 'min(560px, 100%)' }}>
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="life-buoy" /></div>
          <div><h2 className="mono">{t ? t.ticketNumber : 'Ticket'}</h2>{t && <p>{t.subject}</p>}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body" style={{ flex: 1 }}>
          {!data && <div className="skeleton" style={{ height: 200 }}></div>}
          {t && (
            <>
              <dl className="kv" style={{ marginBottom: 14 }}>
                <div><dt>Raised by</dt><dd>{t.createdByName || '—'} · {SOURCE_LABEL[t.createdByRole]}</dd></div>
                <div><dt>Hospital</dt><dd>{t.hospitalName || '—'}</dd></div>
                <div><dt>Category</dt><dd>{CATEGORY_LABEL[t.category] || t.category}</dd></div>
                <div><dt>Status</dt><dd><span className={`badge badge--${STATUS_TONE[t.status]}`}>{t.status.replace('_', ' ')}</span></dd></div>
                <div><dt>Created</dt><dd><time suppressHydrationWarning>{new Date(t.createdAt).toLocaleString()}</time></dd></div>
                <div><dt>SLA due</dt><dd><time suppressHydrationWarning>{new Date(t.slaDueAt).toLocaleString()}</time></dd></div>
              </dl>
              {t.status !== 'CLOSED' && (
                <div className="form-grid" style={{ marginBottom: 16 }}>
                  <div className="field"><label>Assigned to</label>
                    <select className="select" value={t.assignedTo || ''} disabled={busy} onChange={(e) => assign(e.target.value)}>
                      <option value="">Unassigned</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Priority</label>
                    <select className="select" value={t.priority} disabled={busy} onChange={(e) => setPriority(e.target.value)}>
                      {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Conversation</h3>
              <TicketThread messages={data.messages} viewerSide="SUPPORT" />
            </>
          )}
        </div>
        {t && t.status !== 'CLOSED' && (
          <form className="modal__foot" onSubmit={send} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <textarea className="textarea" rows={3} placeholder="Type your response…" value={reply} onChange={(e) => setReply(e.target.value)} required />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div className="action-group">
                {NEXT_ACTIONS[t.status].map(([s, label]) => (
                  <button key={s} type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setStatus(s)}>{label}</button>
                ))}
              </div>
              <button type="submit" className={`btn btn--primary${busy ? ' is-loading' : ''}`} disabled={busy}><Icon name="arrow-right" /><span>Send Reply</span></button>
            </div>
          </form>
        )}
        {t && t.status === 'CLOSED' && <div className="modal__foot"><span className="text-muted">This ticket is closed.</span></div>}
      </div>
    </div>
  );
}

export default function SupportPage() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [categories, setCategories] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState('');
  const [f, setF] = useState({ q: '', source: '', category: '', priority: '', hospitalId: '', from: '', to: '' });
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
      if (tab) qs.set('status', tab);
      qs.set('pageSize', '50');
      const data = await api(`/api/admin/support?${qs}`);
      setItems(data.items); setCounts(data.counts); setCategories(data.categories); setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [f, tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/api/admin/hospitals?pageSize=100').then((d) => setHospitals(d.items)).catch(() => {});
    api('/api/admin/support/assignees').then((d) => setAssignees(d.items)).catch(() => {});
  }, []);

  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const TABS = [['', 'All', all], ['OPEN', 'Open', counts.OPEN || 0], ['IN_PROGRESS', 'In Progress', counts.IN_PROGRESS || 0], ['RESOLVED', 'Resolved', counts.RESOLVED || 0], ['CLOSED', 'Closed', counts.CLOSED || 0]];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support</h1>
          <p>Every ticket raised by doctors, receptionists and patients — in one place.</p>
        </div>
      </div>

      <article className="card card--flush">
        <div className="tabs" role="tablist">
          {TABS.map(([key, label, n]) => (
            <button key={key} type="button" className={`tab${tab === key ? ' is-active' : ''}`} onClick={() => setTab(key)}>{label} <span className="tab__count">{n}</span></button>
          ))}
        </div>
        <div className="toolbar">
          <div className="field toolbar__search"><label>Search tickets</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Ticket number or subject" value={f.q} onChange={set('q')} /></div>
          </div>
          <div className="field toolbar__item"><label>Raised by</label>
            <select className="select" value={f.source} onChange={set('source')}><option value="">All</option><option value="PATIENT">Patient</option><option value="DOCTOR">Doctor</option><option value="RECEPTIONIST">Receptionist</option></select>
          </div>
          <div className="field toolbar__item"><label>Category</label>
            <select className="select" value={f.category} onChange={set('category')}><option value="">All</option>{categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>)}</select>
          </div>
          <div className="field toolbar__item"><label>Priority</label>
            <select className="select" value={f.priority} onChange={set('priority')}><option value="">All</option>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}</select>
          </div>
          <div className="field toolbar__item"><label>Hospital</label>
            <select className="select" value={f.hospitalId} onChange={set('hospitalId')}><option value="">All</option>{hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
          </div>
          <div className="field toolbar__item"><label>From</label><input className="input" type="date" value={f.from} onChange={set('from')} /></div>
          <div className="field toolbar__item"><label>To</label><input className="input" type="date" value={f.to} onChange={set('to')} /></div>
          <button type="button" className="btn btn--ghost" onClick={() => { setF({ q: '', source: '', category: '', priority: '', hospitalId: '', from: '', to: '' }); setTab(''); }}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Ticket ID</th><th>Raised By</th><th>Category</th><th>Hospital</th><th>Priority</th><th>Status</th><th>Updated</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="life-buoy" /></div><h3>No tickets found</h3><p>Tickets raised from the Doctor and Receptionist portals appear here.</p></div></td></tr>
              )}
              {items.map((t) => (
                <tr key={t.id}>
                  <td data-label="Ticket ID" className="cell-primary mono">{t.ticketNumber}<span className="cell-sub" style={{ fontFamily: 'inherit' }}>{t.subject}</span></td>
                  <td data-label="Raised By">{t.createdByName || '—'}<span className="cell-sub">{SOURCE_LABEL[t.createdByRole]}</span></td>
                  <td data-label="Category">{CATEGORY_LABEL[t.category] || t.category}</td>
                  <td data-label="Hospital" className="text-muted">{t.hospitalName || '—'}</td>
                  <td data-label="Priority"><span className={`badge badge--${PRIORITY_TONE[t.priority]}`}>{t.priority}</span></td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[t.status]}`}>{t.status.replace('_', ' ')}</span></td>
                  <td data-label="Updated" className="text-muted"><time suppressHydrationWarning>{new Date(t.updatedAt).toLocaleString()}</time></td>
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => setOpenId(t.id)}><Icon name="eye" />Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} ticket{total === 1 ? '' : 's'}</span></div>
      </article>

      {openId && <TicketDrawer ticketId={openId} assignees={assignees} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
