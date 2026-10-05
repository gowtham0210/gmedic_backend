'use client';

import { useEffect, useState, useCallback } from 'react';
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
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const fill = (text, sample) => String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (sample && sample[k] != null ? sample[k] : `{{${k}}}`));
const LOG_TONE = { DELIVERED: 'confirmed', SKIPPED: 'neutral', FAILED: 'cancelled', UNAVAILABLE: 'pending' };

// ---------------------------------------------------------------- Templates

function TemplateEditor({ template, channels, onClose, onSaved }) {
  const isNew = !template.id;
  const [form, setForm] = useState({ title: template.title, body: template.body, channels: template.channels || ['IN_APP'] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const toggleChannel = (key) => setForm((f) => ({ ...f, channels: f.channels.includes(key) ? f.channels.filter((c) => c !== key) : [...f.channels, key] }));
  const insertVar = (v) => setForm((f) => ({ ...f, body: `${f.body}{{${v}}}` }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = isNew
        ? await api('/api/admin/communications/templates', { method: 'POST', body: { eventKey: template.eventKey, ...form } })
        : await api(`/api/admin/communications/templates/${template.id}`, { method: 'PATCH', body: form });
      toast(res.message, 'success');
      onSaved();
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
      <div className="modal__panel modal__panel--lg">
        <form onSubmit={save}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="message-square" /></div>
            <div><h2>{isNew ? 'Create' : 'Edit'} template</h2><p className="mono">{template.eventKey}</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className="field field--full"><label>Template name</label><input className="input" value={template.name} disabled /></div>
              <div className={`field field--full${errors.channels ? ' has-error' : ''}`}>
                <label>Channels</label>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {channels.map((c) => (
                    <label key={c.key} className="checkbox" title={c.available ? '' : c.note} style={{ opacity: c.available ? 1 : 0.85 }}>
                      <input type="checkbox" checked={form.channels.includes(c.key)} onChange={() => toggleChannel(c.key)} /> {c.label}{!c.available && <small className="text-muted"> · unavailable</small>}
                    </label>
                  ))}
                </div>
                <p className="text-muted" style={{ fontSize: 12.5, marginTop: 6 }}>Only In-App is delivered today. Other channels are saved but need a provider configured — they are logged as unavailable, never as sent.</p>
                {errors.channels && <p className="field__error">{errors.channels}</p>}
              </div>
              <div className={`field field--full${errors.title ? ' has-error' : ''}`}><label>Title</label>
                <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />{errors.title && <p className="field__error">{errors.title}</p>}
              </div>
              <div className={`field field--full${errors.body ? ' has-error' : ''}`}><label>Message</label>
                <textarea className="textarea" rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required />{errors.body && <p className="field__error">{errors.body}</p>}
              </div>
              <div className="field field--full">
                <label>Available variables <small className="text-muted">(click to insert)</small></label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {template.variables.map((v) => <button key={v} type="button" className="chip mono" onClick={() => insertVar(v)}>{`{{${v}}}`}</button>)}
                </div>
              </div>
              {preview && (
                <div className="field field--full">
                  <label>Preview <small className="text-muted">(sample data)</small></label>
                  <div className="card" style={{ background: 'var(--surface-2)', padding: 14 }}>
                    <strong>🔔 {fill(form.title, template.sample)}</strong>
                    <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{fill(form.body, template.sample)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="modal__foot modal__foot--split">
            <button type="button" className="btn btn--ghost" onClick={() => setPreview((p) => !p)}><Icon name="eye" />{preview ? 'Hide preview' : 'Preview'}</button>
            <div className="action-group">
              <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Save Changes</span></button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function History() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
    if (status) qs.set('status', status);
    api(`/api/admin/communications/logs?${qs}`).then(setData).catch((err) => toast(err.message, 'error'));
  }, [status, page]);

  return (
    <article className="card card--flush" style={{ marginTop: 24 }}>
      <div className="card__head"><h2 className="card__title"><Icon name="clipboard-list" />Notification History</h2></div>
      <div className="toolbar">
        <div className="field toolbar__item"><label>Status</label>
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option><option value="DELIVERED">Delivered</option><option value="UNAVAILABLE">Unavailable</option><option value="SKIPPED">Skipped</option><option value="FAILED">Failed</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table table--compact table--stack">
          <thead><tr><th>Event</th><th>Recipient</th><th>Channel</th><th>Status</th><th>Time</th><th>Reason</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div></td></tr>}
            {data && data.items.length === 0 && <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><p className="text-muted" style={{ padding: 16 }}>No notifications have been generated yet.</p></td></tr>}
            {data && data.items.map((l) => (
              <tr key={l.id}>
                <td data-label="Event">{l.eventName}</td>
                <td data-label="Recipient">{l.recipientName || '—'}<span className="cell-sub">{l.recipientRole || ''}</span></td>
                <td data-label="Channel">{l.channel.replace('_', '-')}</td>
                <td data-label="Status"><span className={`badge badge--${LOG_TONE[l.status]}`}>{l.status}</span></td>
                <td data-label="Time" className="text-muted"><time suppressHydrationWarning>{new Date(l.createdAt).toLocaleString()}</time></td>
                <td data-label="Reason" className="text-muted">{l.failureReason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="pager"><span>{data.total} entr{data.total === 1 ? 'y' : 'ies'} · page {data.page} of {data.pages}</span>
          <div className="action-group">
            <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Templates() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    try { setData(await api('/api/admin/communications/templates')); } catch (err) { toast(err.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(t) {
    try {
      const res = await api(`/api/admin/communications/templates/${t.id}/status`, { method: 'PATCH', body: { status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } });
      toast(res.message, 'success');
      load();
      setHistoryKey((k) => k + 1);
    } catch (err) { toast(err.message, 'error'); }
  }

  const chLabel = (keys) => keys.map((k) => (data.channels.find((c) => c.key === k) || { label: k }).label).join(' / ');

  return (
    <>
      <article className="card card--flush">
        <div className="card__head">
          <h2 className="card__title"><Icon name="message-square" />Notification Templates</h2>
          {data && data.unusedEvents.length > 0 && (
            <select className="select" style={{ maxWidth: 240 }} value="" onChange={(e) => { const ev = data.unusedEvents.find((x) => x.eventKey === e.target.value); if (ev) setEditing({ eventKey: ev.eventKey, name: ev.name, title: ev.title, body: ev.body, channels: ['IN_APP'], variables: ev.variables, sample: ev.sample }); }}>
              <option value="">+ Add template for event…</option>
              {data.unusedEvents.map((ev) => <option key={ev.eventKey} value={ev.eventKey}>{ev.name}</option>)}
            </select>
          )}
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Template</th><th>Event key</th><th>Audience</th><th>Channels</th><th>Status</th><th>Updated</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {!data && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {data && data.templates.map((t) => (
                <tr key={t.id}>
                  <td data-label="Template" className="cell-primary">{t.name}</td>
                  <td data-label="Event key" className="mono">{t.eventKey}</td>
                  <td data-label="Audience" className="text-muted">{t.audience || '—'}</td>
                  <td data-label="Channels">{chLabel(t.channels)}</td>
                  <td data-label="Status"><span className={`badge badge--${t.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{t.status === 'ACTIVE' ? 'Enabled' : 'Disabled'}</span></td>
                  <td data-label="Updated" className="text-muted"><time suppressHydrationWarning>{new Date(t.updatedAt).toLocaleDateString()}</time>{t.updatedByName ? ` · ${t.updatedByName}` : ''}</td>
                  <td className="col-actions">
                    <div className="action-group">
                      <button type="button" className="action-btn" onClick={() => setEditing(t)}><Icon name="pencil" />Edit</button>
                      <button type="button" className="action-btn" onClick={() => toggle(t)}><Icon name="toggle-left" />{t.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <History key={historyKey} />
      {editing && data && <TemplateEditor template={editing} channels={data.channels} onClose={() => setEditing(null)} onSaved={() => { load(); setHistoryKey((k) => k + 1); }} />}
    </>
  );
}

// ------------------------------------------------------------ Announcements

function Announcements() {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ title: '', message: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api('/api/admin/communications/announcements')).announcements); } catch (err) { toast(err.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setSaving(true); setErrors({});
    try {
      const res = await api('/api/admin/communications/announcements', { method: 'POST', body: form });
      toast(res.message, 'success'); setForm({ title: '', message: '' }); load();
    } catch (err) { setErrors(err.fields || {}); if (!err.fields) toast(err.message, 'error'); }
    finally { setSaving(false); }
  }
  async function setStatus(id, status) {
    try { const res = await api(`/api/admin/communications/announcements/${id}/publish`, { method: 'PATCH', body: { status } }); toast(res.message, 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <div className="two-col">
      <article className="card card--flush">
        <div className="table-wrap">
          <table className="table table--compact table--stack">
            <thead><tr><th>Announcement</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {!items && <tr><td colSpan={3}><div className="skeleton skeleton--row"></div></td></tr>}
              {items && items.length === 0 && <tr><td colSpan={3} style={{ whiteSpace: 'normal' }}><p className="text-muted" style={{ padding: 16 }}>No announcements yet.</p></td></tr>}
              {items && items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Announcement">{a.title}<span className="cell-sub">{a.message}</span></td>
                  <td data-label="Status"><span className={`badge badge--${a.status === 'PUBLISHED' ? 'confirmed' : a.status === 'ARCHIVED' ? 'neutral' : 'pending'}`}>{a.status}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      {a.status === 'DRAFT' && <button type="button" className="action-btn" onClick={() => setStatus(a.id, 'PUBLISHED')}><Icon name="megaphone" />Publish</button>}
                      {a.status !== 'ARCHIVED' && <button type="button" className="action-btn" onClick={() => setStatus(a.id, 'ARCHIVED')}><Icon name="x" />Archive</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article className="card">
        <div className="card__head"><h2 className="card__title"><Icon name="megaphone" />New Announcement</h2></div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>Published announcements appear at the top of every Doctor and Receptionist portal page.</p>
        <form onSubmit={create}>
          <div className={`field${errors.title ? ' has-error' : ''}`} style={{ marginBottom: 14 }}><label>Title *</label><input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />{errors.title && <p className="field__error">{errors.title}</p>}</div>
          <div className={`field${errors.message ? ' has-error' : ''}`} style={{ marginBottom: 14 }}><label>Message *</label><textarea className="textarea" rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required />{errors.message && <p className="field__error">{errors.message}</p>}</div>
          <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="plus" /><span>Save as Draft</span></button>
        </form>
      </article>
    </div>
  );
}

// ------------------------------------------------------------------ Banners

function Banners() {
  const [items, setItems] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const EMPTY = { title: '', message: '', ctaLabel: '', ctaUrl: '' };
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api('/api/admin/communications/banners')).banners); } catch (err) { toast(err.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true); setErrors({});
    try {
      const res = editingId
        ? await api(`/api/admin/communications/banners/${editingId}`, { method: 'PATCH', body: form })
        : await api('/api/admin/communications/banners', { method: 'POST', body: form });
      toast(res.message, 'success'); setForm(EMPTY); setEditingId(null); load();
    } catch (err) { setErrors(err.fields || {}); if (!err.fields) toast(err.message, 'error'); }
    finally { setSaving(false); }
  }
  async function toggle(b) {
    try { const res = await api(`/api/admin/communications/banners/${b.id}/status`, { method: 'PATCH', body: { status: b.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }); toast(res.message, 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <div className="two-col">
      <article className="card card--flush">
        <div className="table-wrap">
          <table className="table table--compact table--stack">
            <thead><tr><th>Banner</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {!items && <tr><td colSpan={3}><div className="skeleton skeleton--row"></div></td></tr>}
              {items && items.length === 0 && <tr><td colSpan={3} style={{ whiteSpace: 'normal' }}><p className="text-muted" style={{ padding: 16 }}>No banners yet.</p></td></tr>}
              {items && items.map((b) => (
                <tr key={b.id}>
                  <td data-label="Banner">{b.title}<span className="cell-sub">{b.message}{b.ctaLabel ? ` · [${b.ctaLabel}]` : ''}</span></td>
                  <td data-label="Status"><span className={`badge badge--${b.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{b.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      <button type="button" className="action-btn" onClick={() => { setEditingId(b.id); setForm({ title: b.title, message: b.message, ctaLabel: b.ctaLabel || '', ctaUrl: b.ctaUrl || '' }); }}><Icon name="pencil" />Edit</button>
                      <button type="button" className="action-btn" onClick={() => toggle(b)}>{b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article className="card">
        <div className="card__head"><h2 className="card__title"><Icon name="megaphone" />{editingId ? 'Edit Banner' : 'New Banner'}</h2></div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>Active banners appear at the top of every Doctor and Receptionist portal page. Image upload isn&apos;t supported yet.</p>
        <form onSubmit={save}>
          <div className={`field${errors.title ? ' has-error' : ''}`} style={{ marginBottom: 14 }}><label>Title *</label><input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />{errors.title && <p className="field__error">{errors.title}</p>}</div>
          <div className={`field${errors.message ? ' has-error' : ''}`} style={{ marginBottom: 14 }}><label>Description *</label><textarea className="textarea" rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required />{errors.message && <p className="field__error">{errors.message}</p>}</div>
          <div className={`field${errors.ctaLabel ? ' has-error' : ''}`} style={{ marginBottom: 14 }}><label>Button label</label><input className="input" value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} />{errors.ctaLabel && <p className="field__error">{errors.ctaLabel}</p>}</div>
          <div className={`field${errors.ctaUrl ? ' has-error' : ''}`} style={{ marginBottom: 14 }}><label>Button link</label><input className="input" placeholder="https://… or /doctor/schedule" value={form.ctaUrl} onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))} />{errors.ctaUrl && <p className="field__error">{errors.ctaUrl}</p>}</div>
          <div className="action-group">
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>{editingId ? 'Save Changes' : 'Create Banner'}</span></button>
            {editingId && <button type="button" className="btn btn--ghost" onClick={() => { setEditingId(null); setForm(EMPTY); setErrors({}); }}>Cancel</button>}
          </div>
        </form>
      </article>
    </div>
  );
}

const COPY = {
  templates: ['Templates', 'Control the wording of every notification. Changes apply the next time the event happens.'],
  announcements: ['Announcements', 'Broadcast notices to Doctor and Receptionist portals.'],
  banners: ['Banners', 'Promotional or informational banners shown in the portals.'],
};

export default function CommunicationsView({ tab }) {
  return (
    <>
      <div className="page-head"><div><h1>{COPY[tab][0]}</h1><p>{COPY[tab][1]}</p></div></div>
      {tab === 'templates' && <Templates />}
      {tab === 'announcements' && <Announcements />}
      {tab === 'banners' && <Banners />}
    </>
  );
}
