'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import { formatDate } from '../../../lib/format';
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

const ROLE_HINT = {
  SUPER_ADMIN: 'Everything, including the admin team and settings.',
  FINANCE: 'Payments, refunds and disputes.',
  SUPPORT: 'Support tickets, patients and appointments (view).',
  OPERATIONS: 'Hospitals, KYC, doctors, receptionists and QR codes.',
};

function InviteModal({ open, roles, onClose, onCreated }) {
  const blank = { name: '', email: '', phone: '', role: '' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/admin/team', { method: 'POST', body: form });
      toast(res.message, 'success');
      setForm(blank);
      onClose();
      onCreated(res.credentials);
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel">
        <form onSubmit={submit} noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="user-plus" /></div>
            <div><h2 id="invite-title">Invite team member</h2><p>They get a temporary password to change at first sign-in.</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className={`field field--full${errors.name ? ' has-error' : ''}`}><label>Full name *</label><input className="input" value={form.name} onChange={set('name')} />{errors.name && <p className="field__error">{errors.name}</p>}</div>
              <div className={`field${errors.email ? ' has-error' : ''}`}><label>Email *</label><input className="input" type="email" value={form.email} onChange={set('email')} />{errors.email && <p className="field__error">{errors.email}</p>}</div>
              <div className={`field${errors.phone ? ' has-error' : ''}`}><label>Phone</label><input className="input" value={form.phone} onChange={set('phone')} />{errors.phone && <p className="field__error">{errors.phone}</p>}</div>
              <div className={`field field--full${errors.role ? ' has-error' : ''}`}>
                <label>Role *</label>
                <select className="select" value={form.role} onChange={set('role')}>
                  <option value="">Choose a role</option>
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {form.role && <p className="field__hint">{ROLE_HINT[form.role]}</p>}
                {errors.role && <p className="field__error">{errors.role}</p>}
              </div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="user-plus" /><span>Invite</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleModal({ target, roles, onClose, onSaved }) {
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (target) setRole(target.role); }, [target]);
  if (!target) return null;
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/team/${target.id}`, { method: 'PATCH', body: { role } });
      toast(res.message, 'success');
      onClose();
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="role-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-blue"><Icon name="shield" /></div>
            <div><h2 id="role-title">Change role</h2><p>{target.name} will be signed out and see the new role next time.</p></div>
          </div>
          <div className="modal__body">
            <div className="field">
              <label>Role</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <p className="field__hint">{ROLE_HINT[role]}</p>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving || role === target.role}>Change Role</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ confirm, onClose }) {
  const [saving, setSaving] = useState(false);
  if (!confirm) return null;
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try { await confirm.run(); onClose(); } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className={`modal__icon ${confirm.danger ? 'tone-red' : 'tone-amber'}`}><Icon name={confirm.icon} /></div>
            <div><h2 id="confirm-title">{confirm.title}</h2><p>{confirm.body}</p></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${confirm.danger ? 'btn--danger' : 'btn--primary'}${saving ? ' is-loading' : ''}`} disabled={saving}>{confirm.action}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [role, setRoleFilter] = useState('');
  const [status, setStatus] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [creds, setCreds] = useState(null);
  const [roleTarget, setRoleTarget] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (role) qs.set('role', role);
      if (status) qs.set('status', status);
      const data = await api(`/api/admin/team?${qs}`);
      setItems(data.items);
      setRoles(data.roles);
      setMe(data.me);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, role, status]);

  useEffect(() => { load(); }, [load]);
  const roleLabel = (r) => (roles.find((x) => x.value === r) || {}).label || r;

  async function setAccountStatus(m, next) {
    try {
      const res = await api(`/api/admin/team/${m.id}/status`, { method: 'PATCH', body: { status: next } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function resetPassword(m) {
    try {
      const res = await api(`/api/admin/team/${m.id}/reset-password`, { method: 'POST' });
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
          <h1>Admin Team</h1>
          <p>People who can sign in to this console, and what each role can do.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowInvite(true)}><Icon name="user-plus" />Invite Member</button>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Role</label>
            <select className="select" value={role} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setRoleFilter(''); setStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Name</th><th>Role</th><th>Contact</th><th>Last sign-in</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="users" /></div><h3>No team members found</h3><p>Try another role or status.</p></div></td></tr>
              )}
              {!loading && items.map((m) => {
                const self = m.id === me;
                return (
                  <tr key={m.id}>
                    <td data-label="Name" className="cell-primary">{m.name}{self && <span className="badge badge--pending" style={{ marginLeft: 8 }}>You</span>}<span className="cell-sub mono">{m.id}</span></td>
                    <td data-label="Role">{roleLabel(m.role)}</td>
                    <td data-label="Contact"><span>{m.email}</span>{m.phone && <span className="cell-sub">{m.phone}</span>}</td>
                    <td data-label="Last sign-in" className="text-muted">{m.lastLoginAt ? formatDate(m.lastLoginAt) : (m.mustChangePassword ? 'Not yet (invited)' : '—')}</td>
                    <td data-label="Status"><span className={`badge badge--${m.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{m.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></td>
                    <td className="col-actions">
                      {self ? <span className="text-muted">Manage in My profile</span> : (
                        <div className="action-group">
                          {m.status === 'ACTIVE' && <button type="button" className="action-btn" onClick={() => setRoleTarget(m)}><Icon name="shield" />Role</button>}
                          {m.status === 'ACTIVE' && (
                            <button type="button" className="action-btn" onClick={() => setConfirm({ title: `Reset ${m.name}'s password?`, body: 'Their current password stops working and every open session ends. You will get a temporary password to share.', action: 'Reset Password', icon: 'lock', run: () => resetPassword(m) })}><Icon name="lock" />Reset Password</button>
                          )}
                          <button type="button" className="action-btn" onClick={() => (m.status === 'ACTIVE'
                            ? setConfirm({ title: `Deactivate ${m.name}?`, body: 'They can no longer sign in, and any open session ends. Their audit history is kept. You can activate them again later.', action: 'Deactivate Account', icon: 'user-x', danger: true, run: () => setAccountStatus(m, 'INACTIVE') })
                            : setAccountStatus(m, 'ACTIVE'))}><Icon name={m.status === 'ACTIVE' ? 'user-x' : 'user-check'} />{m.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{items.length} team member{items.length === 1 ? '' : 's'}</span></div>
      </article>

      <InviteModal open={showInvite} roles={roles} onClose={() => setShowInvite(false)} onCreated={(c) => { setCreds(c); load(); }} />
      <RoleModal target={roleTarget} roles={roles} onClose={() => setRoleTarget(null)} onSaved={load} />
      <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </>
  );
}
