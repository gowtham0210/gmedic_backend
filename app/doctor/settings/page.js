'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';
import { DEFAULT_PREFS, readPrefs, savePrefs } from '../../../lib/doctorPrefs';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

function AccountTab({ data }) {
  return (
    <article className="card">
      <dl className="kv">
        <div><dt>Email</dt><dd>{data?.user?.email || '—'}</dd></div>
        <div><dt>Phone</dt><dd>{data?.user?.phone || '—'}</dd></div>
      </dl>
      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 14 }}>To change your email or phone, contact your hospital administrator.</p>
    </article>
  );
}

function SecurityTab() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/doctor/profile/password', { method: 'PUT', body: form });
      toast(res.message, 'success');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card">
      <h3 style={{ marginBottom: 14 }}>Change Password</h3>
      <form onSubmit={submit}>
        <div className={`field${errors.currentPassword ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
          <label>Current password</label>
          <input className="input" type="password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
          {errors.currentPassword && <p className="field__error">{errors.currentPassword}</p>}
        </div>
        <div className={`field${errors.newPassword ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
          <label>New password</label>
          <input className="input" type="password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} required />
          {errors.newPassword && <p className="field__error">{errors.newPassword}</p>}
        </div>
        <div className={`field${errors.confirmPassword ? ' has-error' : ''}`} style={{ marginBottom: 18 }}>
          <label>Confirm new password</label>
          <input className="input" type="password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} required />
          {errors.confirmPassword && <p className="field__error">{errors.confirmPassword}</p>}
        </div>
        <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="lock" /><span>Change Password</span></button>
      </form>
    </article>
  );
}

// Display preferences for this device (lib/doctorPrefs): honoured by Appointments and Today's Queue.
// Which notices reach the bell, saved on the server (GET/PUT /api/doctor/notification-preferences)
// and applied when a notice is sent. Each switch saves on its own.
function NotificationPrefs() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { api('/api/doctor/notification-preferences').then(setData).catch((err) => toast(err.message, 'error')); }, []);

  async function toggle(p) {
    setBusy(p.key);
    try {
      const res = await api('/api/doctor/notification-preferences', { method: 'PUT', body: { preferences: { [p.key]: !p.enabled } } });
      setData(res);
      toast(`${p.label}: ${!p.enabled ? 'on' : 'off'}.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="card" style={{ marginBottom: 20 }}>
      <div className="card__head"><div><h2 className="card__title"><Icon name="bell" />Notifications</h2><p className="card__subtitle">What appears in the bell at the top of the portal. Saved to your account.</p></div></div>
      {!data && <div className="skeleton skeleton--row"></div>}
      {data && data.preferences.map((p) => (
        <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-2)' }}>
          <div style={{ flex: 1 }}><strong>{p.label}</strong><div className="text-muted" style={{ fontSize: 12.5 }}>{p.help}</div></div>
          <label className="switch" title={p.enabled ? 'On' : 'Off'}>
            <input type="checkbox" checked={p.enabled} disabled={busy === p.key} onChange={() => toggle(p)} aria-label={`${p.label} notifications`} />
            <span className="switch__track"></span>
          </label>
        </div>
      ))}
      {data && data.alwaysOn.map((a) => (
        <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
          <div style={{ flex: 1 }}><strong>{a.label}</strong><div className="text-muted" style={{ fontSize: 12.5 }}>{a.help}</div></div>
          <span className="badge badge--neutral"><Icon name="lock" className="icon--xs" /> Always on</span>
        </div>
      ))}
    </article>
  );
}

function PreferencesTab() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  useEffect(() => { setPrefs(readPrefs()); }, []);
  function set(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    toast('Preference saved on this device.', 'success');
  }
  return (
    <>
    <NotificationPrefs />
    <article className="card">
      <div className="card__head"><div><h2 className="card__title"><Icon name="settings" />Display</h2></div></div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Appointments list opens on</label>
        <select className="select" value={prefs.defaultStatus} onChange={(e) => set('defaultStatus', e.target.value)}>
          <option value="">All appointments</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div className="field">
        <label>Time format</label>
        <select className="select" value={prefs.timeFormat} onChange={(e) => set('timeFormat', e.target.value)}>
          <option value="12h">12-hour (09:30 AM)</option>
          <option value="24h">24-hour (09:30)</option>
        </select>
      </div>
      <p className="field__hint" style={{ marginTop: 12 }}>Saved on this device only. Used on Appointments and Today&apos;s Queue.</p>
    </article>
    </>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('account');
  const [data, setData] = useState(null);

  useEffect(() => { api('/api/doctor/profile').then(setData).catch(() => {}); }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Account, security, notification and display preferences.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab${tab === 'account' ? ' is-active' : ''}`} onClick={() => setTab('account')}>Account</button>
        <button type="button" className={`tab${tab === 'security' ? ' is-active' : ''}`} onClick={() => setTab('security')}>Security</button>
        <button type="button" className={`tab${tab === 'preferences' ? ' is-active' : ''}`} onClick={() => setTab('preferences')}>Preferences</button>
      </div>

      {tab === 'account' && <AccountTab data={data} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'preferences' && <PreferencesTab />}
    </>
  );
}
