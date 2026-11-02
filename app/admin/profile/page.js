'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';
import { formatDate } from '../../../lib/format';

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

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', FINANCE: 'Finance', SUPPORT: 'Support', OPERATIONS: 'Operations' };

function Field({ label, error, children }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label>{label}</label>
      {children}
      {error && <p className="field__error">{error}</p>}
    </div>
  );
}

export default function AdminProfilePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const blankPw = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const [pw, setPw] = useState(blankPw);
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api('/api/admin/profile').then((d) => {
      setUser(d.user);
      setProfile({ name: d.user.name, phone: d.user.phone || '' });
    }).catch((err) => toast(err.message, 'error'));
  }, []);

  // The top-bar "Change password" link lands on #password.
  useEffect(() => {
    if (user && window.location.hash === '#password') document.getElementById('password')?.scrollIntoView({ block: 'start' });
  }, [user]);

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    try {
      const res = await api('/api/admin/profile', { method: 'PUT', body: profile });
      setUser(res.user);
      document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = res.user.name; });
      document.querySelectorAll('[data-user-initials]').forEach((el) => { el.textContent = res.user.initials; });
      toast(res.message, 'success');
    } catch (err) {
      setProfileErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setSavingPw(true);
    setPwErrors({});
    try {
      const res = await api('/api/admin/profile/password', { method: 'PUT', body: pw });
      setPw(blankPw);
      toast(`${res.message} Other devices have been signed out.`, 'success');
    } catch (err) {
      setPwErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSavingPw(false);
    }
  }

  if (!user) return <article className="card"><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></article>;
  const setP = (k) => (e) => setProfile((f) => ({ ...f, [k]: e.target.value }));
  const setW = (k) => (e) => setPw((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p>Your own console account. Your role is managed by a Super Admin in Admin Team.</p>
        </div>
      </div>

      <div className="dash-grid dash-grid--charts" style={{ alignItems: "start" }}>
        <article className="card">
          <div className="card__head"><div><h2 className="card__title"><Icon name="user" />Profile</h2><p className="card__subtitle">{ROLE_LABEL[user.role] || user.role} · {user.email}</p></div></div>
          <form onSubmit={saveProfile} noValidate>
            <div className="form-grid">
              <Field label="Full name *" error={profileErrors.name}><input className="input" value={profile.name} onChange={setP('name')} /></Field>
              <Field label="Phone" error={profileErrors.phone}><input className="input" value={profile.phone} onChange={setP('phone')} placeholder="10-digit mobile" /></Field>
            </div>
            <dl className="kv" style={{ marginTop: 16 }}>
              <div><dt>Sign-in email</dt><dd>{user.email}</dd></div>
              <div><dt>Password last changed</dt><dd>{user.passwordChangedAt ? formatDate(user.passwordChangedAt) : '—'}</dd></div>
            </dl>
            <div className="kyc-section__actions">
              <button type="submit" className={`btn btn--primary${savingProfile ? ' is-loading' : ''}`} disabled={savingProfile}><Icon name="check" />Save Profile</button>
            </div>
          </form>
        </article>

        <article className="card" id="password">
          <div className="card__head"><div><h2 className="card__title"><Icon name="lock" />Change password</h2><p className="card__subtitle">At least 8 characters with a letter and a number. Other devices are signed out.</p></div></div>
          <form onSubmit={changePassword} noValidate>
            <div className="form-grid">
              <div className="field--full"><Field label="Current password *" error={pwErrors.currentPassword}><input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={setW('currentPassword')} /></Field></div>
              <Field label="New password *" error={pwErrors.newPassword}><input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={setW('newPassword')} /></Field>
              <Field label="Confirm new password *" error={pwErrors.confirmPassword}><input className="input" type="password" autoComplete="new-password" value={pw.confirmPassword} onChange={setW('confirmPassword')} /></Field>
            </div>
            <div className="kyc-section__actions">
              <button type="submit" className={`btn btn--primary${savingPw ? ' is-loading' : ''}`} disabled={savingPw}><Icon name="lock" />Change Password</button>
            </div>
          </form>
        </article>
      </div>
    </>
  );
}
