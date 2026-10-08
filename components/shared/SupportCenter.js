'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../Icon';
import TicketThread from './TicketThread';
import { formatDateTime } from '../../lib/format';

const STATUS_TONE = { OPEN: 'pending', IN_PROGRESS: 'pending', RESOLVED: 'confirmed', CLOSED: 'neutral' };
const PRIORITY_TONE = { LOW: 'neutral', MEDIUM: 'pending', HIGH: 'cancelled', URGENT: 'cancelled' };
const CATEGORY_LABEL = { APPOINTMENT: 'Appointment', PAYMENT: 'Payment', REFUND: 'Refund', HOSPITAL: 'Hospital', DOCTOR: 'Doctor', ACCOUNT: 'Account', QR: 'QR / Scanning', SCHEDULE: 'Schedule', TECHNICAL: 'Technical issue', OTHER: 'Other' };
const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}, loginRole) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = `/login?expired=1&role=${loginRole}`; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

function NewTicketModal({ open, categories, onClose, onCreated, call }) {
  const [form, setForm] = useState({ category: 'TECHNICAL', subject: '', description: '', priority: 'MEDIUM' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await call('', { method: 'POST', body: form });
      toast(res.message, 'success');
      setForm({ category: 'TECHNICAL', subject: '', description: '', priority: 'MEDIUM' });
      onCreated(res.ticket);
      onClose();
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
            <div><h2>New Support Ticket</h2><p>Describe the problem and Gmedic Support will reply here.</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className="field"><label>Category</label>
                <select className="select" value={form.category} onChange={set('category')}>{categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>)}</select>
              </div>
              <div className="field"><label>Priority</label>
                <select className="select" value={form.priority} onChange={set('priority')}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select>
              </div>
              <div className={`field field--full${errors.subject ? ' has-error' : ''}`}><label>Subject *</label>
                <input className="input" value={form.subject} onChange={set('subject')} required />{errors.subject && <p className="field__error">{errors.subject}</p>}
              </div>
              <div className={`field field--full${errors.description ? ' has-error' : ''}`}><label>Description *</label>
                <textarea className="textarea" rows={5} value={form.description} onChange={set('description')} required />{errors.description && <p className="field__error">{errors.description}</p>}
              </div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Submit Ticket</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TicketDrawer({ ticketId, ownerRole, onClose, onChanged, call }) {
  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try { setData(await call(`/${ticketId}`)); } catch (err) { toast(err.message, 'error'); onClose(); }
  }, [ticketId, call, onClose]);
  useEffect(() => { load(); }, [load]);

  async function send(e) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await call(`/${ticketId}/messages`, { method: 'POST', body: { message: reply } });
      setReply('');
      setData((d) => ({ ...d, messages: res.messages }));
      onChanged();
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  const t = data && data.ticket;
  return (
    <div className="modal modal--drawer" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--drawer">
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="life-buoy" /></div>
          <div><h2>{t ? t.ticketNumber : 'Ticket'}</h2>{t && <p>{t.subject}</p>}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body" style={{ flex: 1 }}>
          {!data && <div className="skeleton" style={{ height: 160 }}></div>}
          {t && (
            <>
              <dl className="kv" style={{ marginBottom: 18 }}>
                <div><dt>Status</dt><dd><span className={`badge badge--${STATUS_TONE[t.status]}`}>{t.status.replace('_', ' ')}</span></dd></div>
                <div><dt>Priority</dt><dd><span className={`badge badge--${PRIORITY_TONE[t.priority]}`}>{t.priority}</span></dd></div>
                <div><dt>Category</dt><dd>{CATEGORY_LABEL[t.category] || t.category}</dd></div>
                <div><dt>Assigned to</dt><dd>{t.assigneeName || 'Awaiting assignment'}</dd></div>
              </dl>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Conversation</h3>
              <TicketThread messages={data.messages} viewerSide={ownerRole} />
            </>
          )}
        </div>
        {t && t.status !== 'CLOSED' && (
          <form className="modal__foot" onSubmit={send} style={{ alignItems: 'flex-end' }}>
            <textarea className="textarea" rows={2} style={{ flex: 1 }} placeholder="Type your reply…" value={reply} onChange={(e) => setReply(e.target.value)} required />
            <button type="submit" className={`btn btn--primary${sending ? ' is-loading' : ''}`} disabled={sending}><Icon name="arrow-right" /><span>Send</span></button>
          </form>
        )}
        {t && t.status === 'CLOSED' && <div className="modal__foot"><span className="text-muted">This ticket is closed. Open a new ticket if you still need help.</span></div>}
      </div>
    </div>
  );
}

export default function SupportCenter({ apiBase, loginRole }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(['OTHER']);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);

  const call = useCallback((path, opts) => api(`${apiBase}${path}`, opts, loginRole), [apiBase, loginRole]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (q) qs.set('q', q);
      const data = await call(`?${qs}`);
      setItems(data.items);
      setCategories(data.categories);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [call, status, q]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Help &amp; Support</h1>
          <p>Raise a ticket and follow the conversation with Gmedic Support.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowNew(true)}><Icon name="plus" />New Ticket</button>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search"><label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Ticket number or subject" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item"><label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Ticket</th><th>Category</th><th>Priority</th><th>Status</th><th>Updated</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="life-buoy" /></div><h3>No tickets yet</h3><p>Click New Ticket if something isn&apos;t working.</p></div></td></tr>
              )}
              {items.map((t) => (
                <tr key={t.id}>
                  <td data-label="Ticket" className="cell-primary">{t.subject}<span className="cell-sub mono">{t.ticketNumber}</span></td>
                  <td data-label="Category">{CATEGORY_LABEL[t.category] || t.category}</td>
                  <td data-label="Priority"><span className={`badge badge--${PRIORITY_TONE[t.priority]}`}>{t.priority}</span></td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[t.status]}`}>{t.status.replace('_', ' ')}</span></td>
                  <td data-label="Updated" className="text-muted"><time suppressHydrationWarning>{formatDateTime(t.updatedAt)}</time></td>
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => setOpenId(t.id)}><Icon name="eye" />Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{items.length} ticket{items.length === 1 ? '' : 's'}</span></div>
      </article>

      <NewTicketModal open={showNew} categories={categories} onClose={() => setShowNew(false)} onCreated={() => load()} call={call} />
      {openId && <TicketDrawer ticketId={openId} ownerRole={loginRole} onClose={() => setOpenId(null)} onChanged={load} call={call} />}
    </>
  );
}
