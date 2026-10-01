'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

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

function Templates() {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/communications/templates');
      setTemplates(data.templates);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(t) {
    setEditing(t);
    setForm({ title: t.title || '', body: t.body });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api(`/api/admin/communications/templates/${editing.id}`, { method: 'PATCH', body: form });
      toast(res.message, 'success');
      setEditing(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(t) {
    try {
      await api(`/api/admin/communications/templates/${t.id}`, { method: 'PATCH', body: { status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', body: t.body } });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="two-col">
      <article className="card card--flush">
        <div className="table-wrap">
          <table className="table table--compact table--stack">
            <thead><tr><th>Template</th><th>Channel</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={4}><div className="skeleton skeleton--row"></div></td></tr>}
              {templates.map((t) => (
                <tr key={t.id}>
                  <td data-label="Template">{t.name}<span className="cell-sub mono">{t.code}</span></td>
                  <td data-label="Channel">{t.channel}</td>
                  <td data-label="Status"><span className={`badge badge--${t.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{t.status}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      <button type="button" className="action-btn" onClick={() => startEdit(t)}><Icon name="pencil" />Edit</button>
                      <button type="button" className="action-btn" onClick={() => toggleStatus(t)}>{t.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article className="card">
        <div className="card__head"><h2 className="card__title"><Icon name="message-square" />{editing ? editing.name : 'Select a template'}</h2></div>
        {editing ? (
          <>
            <div className="field" style={{ marginBottom: 14 }}><label>Title</label><input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div className="field" style={{ marginBottom: 14 }}><label>Body</label><textarea className="textarea" rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} /></div>
            <button type="button" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving} onClick={save}><Icon name="check" /><span>Save</span></button>
          </>
        ) : <p className="text-muted">Click Edit on a template to change its wording.</p>}
      </article>
    </div>
  );
}

function Announcements() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', message: '' });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/communications/announcements');
      setItems(data.announcements);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api('/api/admin/communications/announcements', { method: 'POST', body: form });
      toast(res.message, 'success');
      setForm({ title: '', message: '' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id, status) {
    try {
      const res = await api(`/api/admin/communications/announcements/${id}/publish`, { method: 'PATCH', body: { status } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="two-col">
      <article className="card card--flush">
        <div className="table-wrap">
          <table className="table table--compact table--stack">
            <thead><tr><th>Announcement</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={3}><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={3} style={{ whiteSpace: 'normal' }}><p className="text-muted">No announcements yet.</p></td></tr>}
              {items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Announcement">{a.title}<span className="cell-sub">{a.message}</span></td>
                  <td data-label="Status"><span className={`badge badge--${a.status === 'PUBLISHED' ? 'confirmed' : a.status === 'ARCHIVED' ? 'neutral' : 'pending'}`}>{a.status}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      {a.status === 'DRAFT' && <button type="button" className="action-btn" onClick={() => setStatus(a.id, 'PUBLISHED')}><Icon name="megaphone" />Publish</button>}
                      {a.status === 'PUBLISHED' && <button type="button" className="action-btn" onClick={() => setStatus(a.id, 'ARCHIVED')}><Icon name="x" />Archive</button>}
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
        <form onSubmit={create}>
          <div className="field" style={{ marginBottom: 14 }}><label>Title *</label><input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
          <div className="field" style={{ marginBottom: 14 }}><label>Message *</label><textarea className="textarea" rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required /></div>
          <button type="submit" className={`btn btn--primary${creating ? ' is-loading' : ''}`} disabled={creating}><Icon name="plus" /><span>Draft</span></button>
        </form>
      </article>
    </div>
  );
}

function Banners() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', message: '', ctaLabel: '', ctaUrl: '' });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/communications/banners');
      setItems(data.banners);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api('/api/admin/communications/banners', { method: 'POST', body: form });
      toast(res.message, 'success');
      setForm({ title: '', message: '', ctaLabel: '', ctaUrl: '' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function toggle(b) {
    try {
      await api(`/api/admin/communications/banners/${b.id}/status`, { method: 'PATCH', body: { status: b.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="two-col">
      <article className="card card--flush">
        <div className="table-wrap">
          <table className="table table--compact table--stack">
            <thead><tr><th>Banner</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={3}><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={3} style={{ whiteSpace: 'normal' }}><p className="text-muted">No banners yet.</p></td></tr>}
              {items.map((b) => (
                <tr key={b.id}>
                  <td data-label="Banner">{b.title}<span className="cell-sub">{b.message}</span></td>
                  <td data-label="Status"><span className={`badge badge--${b.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{b.status}</span></td>
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => toggle(b)}>{b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article className="card">
        <div className="card__head"><h2 className="card__title"><Icon name="megaphone" />New Banner</h2></div>
        <form onSubmit={create}>
          <div className="field" style={{ marginBottom: 14 }}><label>Title *</label><input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
          <div className="field" style={{ marginBottom: 14 }}><label>Message *</label><textarea className="textarea" rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required /></div>
          <div className="field" style={{ marginBottom: 14 }}><label>CTA label</label><input className="input" value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} /></div>
          <div className="field" style={{ marginBottom: 14 }}><label>CTA URL</label><input className="input" value={form.ctaUrl} onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))} /></div>
          <button type="submit" className={`btn btn--primary${creating ? ' is-loading' : ''}`} disabled={creating}><Icon name="plus" /><span>Create</span></button>
        </form>
      </article>
    </div>
  );
}

export default function CommunicationsPage() {
  const [tab, setTab] = useState('templates');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Communications</h1>
          <p>Notification templates, broadcast announcements and patient-app banners.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab${tab === 'templates' ? ' is-active' : ''}`} onClick={() => setTab('templates')}>Templates</button>
        <button type="button" className={`tab${tab === 'announcements' ? ' is-active' : ''}`} onClick={() => setTab('announcements')}>Announcements</button>
        <button type="button" className={`tab${tab === 'banners' ? ' is-active' : ''}`} onClick={() => setTab('banners')}>Banners</button>
      </div>

      {tab === 'templates' && <Templates />}
      {tab === 'announcements' && <Announcements />}
      {tab === 'banners' && <Banners />}
    </>
  );
}
