'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };
const PREFS_KEY = 'gmedic.doctor.preferences';

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

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
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

function NotificationsTab() {
  const [prefs, setPrefs] = useState({ appointment: true, queue: true, schedule: true, sms: false, push: true });
  useEffect(() => { setPrefs((p) => ({ ...p, ...readPrefs().notifications })); }, []);
  function toggle(key) {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] };
      savePrefs({ ...readPrefs(), notifications: next });
      return next;
    });
  }
  const rows = [
    ['appointment', 'Appointment notifications'],
    ['queue', 'Queue notifications'],
    ['schedule', 'Schedule change notifications'],
    ['sms', 'SMS notifications'],
    ['push', 'Push notifications'],
  ];
  return (
    <article className="card">
      {rows.map(([key, label]) => (
        <label key={key} className="checkbox" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-2)' }}>
          <span>{label}</span>
          <input type="checkbox" checked={!!prefs[key]} onChange={() => toggle(key)} />
        </label>
      ))}
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

function PreferencesTab() {
  const [prefs, setPrefs] = useState({ defaultView: 'upcoming', timeFormat: '12h' });
  useEffect(() => { setPrefs((p) => ({ ...p, ...readPrefs().preferences })); }, []);
  function set(key, value) {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      savePrefs({ ...readPrefs(), preferences: next });
      return next;
    });
  }
  return (
    <article className="card">
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Default appointment view</label>
        <select className="select" value={prefs.defaultView} onChange={(e) => set('defaultView', e.target.value)}>
          <option value="all">All</option>
          <option value="upcoming">Upcoming</option>
          <option value="waiting">Waiting</option>
        </select>
      </div>
      <div className="field">
        <label>Time format</label>
        <select className="select" value={prefs.timeFormat} onChange={(e) => set('timeFormat', e.target.value)}>
          <option value="12h">12-hour (AM/PM)</option>
          <option value="24h">24-hour</option>
        </select>
      </div>
    </article>
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
          <p>Account, notifications, security and preferences.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab${tab === 'account' ? ' is-active' : ''}`} onClick={() => setTab('account')}>Account</button>
        <button type="button" className={`tab${tab === 'notifications' ? ' is-active' : ''}`} onClick={() => setTab('notifications')}>Notifications</button>
        <button type="button" className={`tab${tab === 'security' ? ' is-active' : ''}`} onClick={() => setTab('security')}>Security</button>
        <button type="button" className={`tab${tab === 'preferences' ? ' is-active' : ''}`} onClick={() => setTab('preferences')}>Preferences</button>
      </div>

      {tab === 'account' && <AccountTab data={data} />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'preferences' && <PreferencesTab />}
    </>
  );
}
