'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import useHospitalOptions from '../../../components/admin/useHospitalOptions';
import usePermissions from '../../../components/admin/usePermissions';
import Pager, { usePager } from '../../../components/admin/Pager';
import CredentialsModal from '../../../components/admin/CredentialsModal';

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
      onCreated(res.credentials);
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
                  {hospitals.filter((h) => h.status !== 'OFFBOARDED').map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
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

// Fix a typo, change contact details, or move the person to another hospital. A move signs them out.
function EditModal({ target, hospitals, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', hospitalId: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (target) { setForm({ name: target.name, email: target.email, phone: target.phone || '', hospitalId: target.hospitalId }); setErrors({}); }
  }, [target]);
  if (!target) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const moving = form.hospitalId !== target.hospitalId;
  // Offboarded hospitals can't take staff (the current one stays listed so the form still shows it).
  const options = hospitals.filter((h) => h.status !== 'OFFBOARDED' || h.id === target.hospitalId);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api(`/api/admin/receptionists/${target.id}`, { method: 'PUT', body: form });
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
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-rec-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="pencil" /></div>
            <div><h2 id="edit-rec-title">Edit {target.name}</h2><p>{target.id} · they sign in with their email address.</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className={`field field--full${errors.name ? ' has-error' : ''}`}><label>Full name *</label><input className="input" value={form.name} onChange={set('name')} maxLength={60} required />{errors.name && <p className="field__error">{errors.name}</p>}</div>
              <div className={`field${errors.email ? ' has-error' : ''}`}><label>Email *</label><input className="input" type="email" value={form.email} onChange={set('email')} required />{errors.email && <p className="field__error">{errors.email}</p>}</div>
              <div className={`field${errors.phone ? ' has-error' : ''}`}><label>Phone *</label><input className="input" value={form.phone} onChange={set('phone')} required />{errors.phone && <p className="field__error">{errors.phone}</p>}</div>
              <div className={`field field--full${errors.hospitalId ? ' has-error' : ''}`}>
                <label>Hospital *</label>
                <select className="select" value={form.hospitalId} onChange={set('hospitalId')} required>
                  {options.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                {errors.hospitalId && <p className="field__error">{errors.hospitalId}</p>}
                {moving && <p className="field__hint is-warning"><Icon name="alert-triangle" className="icon--xs" />Moving {target.name} to another hospital signs them out right away.</p>}
              </div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Save</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Deactivation locks the account out (login is refused and any open session ends
// on its next request), so it is confirmed first. Activation stays one click.
function DeactivateModal({ target, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try { await onConfirm(target); onClose(); } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="deactivate-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="user-x" /></div>
            <div><h2 id="deactivate-title">Deactivate {target.name}?</h2><p>This account will no longer be able to sign in to the Gmedic platform, and any open session will end. You can activate it again later.</p></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--danger${saving ? ' is-loading' : ''}`} disabled={saving}>Deactivate Account</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Resetting a password ends every open session of that person and invalidates the current one, so confirm first.
function ResetModal({ target, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try { await onConfirm(target); onClose(); } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-amber"><Icon name="lock" /></div>
            <div><h2 id="reset-title">Reset password for {target.name}?</h2><p>Their current password stops working and they are signed out everywhere. You&apos;ll get a new temporary password to share with them; they must change it when they next sign in.</p></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}>Reset Password</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReceptionistsPage() {
  const can = usePermissions();
  const [items, setItems] = useState([]);
  const hospitals = useHospitalOptions();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [creds, setCreds] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const [page, setPage] = usePager(JSON.stringify([q, status]));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      qs.set('pageSize', '25');
      qs.set('page', String(page));
      const data = await api(`/api/admin/receptionists?${qs}`);
      setItems(data.items);
      setTotal(data.total); setPages(data.pages || 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => { load(); }, [load]);

  async function setAccountStatus(r, next) {
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
      setCreds(res.credentials);
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
          {can('receptionists.manage') && <button type="button" className="btn btn--primary" onClick={() => setShowAdd(true)}><Icon name="user-plus" />Add Receptionist</button>}
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
                    {can('receptionists.manage') && <div className="action-group">
                      <button type="button" className="action-btn" onClick={() => setEditTarget(r)}><Icon name="pencil" />Edit</button>
                      <button type="button" className="action-btn" onClick={() => setResetTarget(r)}><Icon name="lock" />Reset Password</button>
                      <button type="button" className="action-btn" onClick={() => (r.status === 'ACTIVE' ? setDeactivateTarget(r) : setAccountStatus(r, 'ACTIVE'))}><Icon name={r.status === 'ACTIVE' ? 'user-x' : 'user-check'} />{r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} pages={pages} noun="receptionist" onPage={setPage} />
      </article>

      <AddModal open={showAdd} hospitals={hospitals} onClose={() => setShowAdd(false)} onCreated={(creds) => { setCreds(creds); load(); }} />
      <EditModal target={editTarget} hospitals={hospitals} onClose={() => setEditTarget(null)} onSaved={load} />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
      <ResetModal target={resetTarget} onClose={() => setResetTarget(null)} onConfirm={resetPassword} />
      <DeactivateModal target={deactivateTarget} onClose={() => setDeactivateTarget(null)} onConfirm={(r) => setAccountStatus(r, 'INACTIVE')} />
    </>
  );
}
