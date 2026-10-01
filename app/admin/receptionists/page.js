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

function CredentialsModal({ creds, onClose }) {
  if (!creds) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <div className="modal__head">
          <div className="modal__icon tone-green"><Icon name="check-circle" /></div>
          <div><h2>Credentials issued</h2><p>Share these securely — the temporary password must be changed on first login.</p></div>
        </div>
        <div className="modal__body">
          <dl className="kv">
            <div><dt>Username</dt><dd className="mono">{creds.username}</dd></div>
            <div><dt>Temp password</dt><dd className="mono">{creds.tempPassword}</dd></div>
          </dl>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function AddModal({ open, hospitals, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', hospitalId: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/admin/receptionists', { method: 'POST', body: form });
      onClose();
      onCreated(res.receptionist);
      setForm({ name: '', email: '', phone: '', hospitalId: '' });
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
            <div className="modal__icon tone-teal"><Icon name="user-plus" /></div>
            <div><h2>Add Receptionist</h2><p>A temporary password will be generated.</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className={`field field--full${errors.name ? ' has-error' : ''}`}><label>Full name *</label><input className="input" value={form.name} onChange={set('name')} required />{errors.name && <p className="field__error">{errors.name}</p>}</div>
              <div className={`field${errors.email ? ' has-error' : ''}`}><label>Email *</label><input className="input" type="email" value={form.email} onChange={set('email')} required />{errors.email && <p className="field__error">{errors.email}</p>}</div>
              <div className={`field${errors.phone ? ' has-error' : ''}`}><label>Phone *</label><input className="input" value={form.phone} onChange={set('phone')} required />{errors.phone && <p className="field__error">{errors.phone}</p>}</div>
              <div className={`field field--full${errors.hospitalId ? ' has-error' : ''}`}>
                <label>Hospital *</label>
                <select className="select" value={form.hospitalId} onChange={set('hospitalId')} required>
                  <option value="">Select hospital</option>
                  {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                {errors.hospitalId && <p className="field__error">{errors.hospitalId}</p>}
              </div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Add</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReceptionistsPage() {
  const [items, setItems] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [creds, setCreds] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      qs.set('pageSize', '100');
      const data = await api(`/api/admin/receptionists?${qs}`);
      setItems(data.items);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/api/admin/hospitals?pageSize=100').then((d) => setHospitals(d.items)).catch(() => {}); }, []);

  async function toggleStatus(r) {
    const next = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await api(`/api/admin/receptionists/${r.id}/status`, { method: 'PATCH', body: { status: next } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function resetPassword(r) {
    try {
      const res = await api(`/api/admin/receptionists/${r.id}/reset-password`, { method: 'POST' });
      toast(res.message, 'success');
      setCreds({ username: r.email, tempPassword: res.tempPassword });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Receptionists</h1>
          <p>Front-desk accounts across every hospital.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowAdd(true)}><Icon name="user-plus" />Add Receptionist</button>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Name</th><th>Hospital</th><th>Contact</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="users" /></div><h3>No receptionists found</h3><p>Add the first receptionist for a hospital.</p></div></td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td data-label="Name" className="cell-primary">{r.name}<span className="cell-sub mono">{r.id}</span></td>
                  <td data-label="Hospital" className="text-muted">{r.hospitalName}</td>
                  <td data-label="Contact"><span>{r.email}</span><span className="cell-sub">{r.phone}</span></td>
                  <td data-label="Status"><span className={`badge badge--${r.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{r.status}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      <button type="button" className="action-btn" onClick={() => resetPassword(r)}><Icon name="lock" />Reset Password</button>
                      <button type="button" className="action-btn" onClick={() => toggleStatus(r)}><Icon name={r.status === 'ACTIVE' ? 'user-x' : 'user-check'} />{r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{items.length} receptionist{items.length === 1 ? '' : 's'}</span></div>
      </article>

      <AddModal open={showAdd} hospitals={hospitals} onClose={() => setShowAdd(false)} onCreated={(creds) => { setCreds(creds); load(); }} />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </>
  );
}
