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
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const SETTING_LABELS = {
  booking_window_days: 'Booking window (days ahead patients can book)',
  appointment_hold_minutes: 'Appointment hold time (minutes)',
  cancellation_cutoff_hours: 'Cancellation cutoff (hours before appointment)',
  no_show_grace_minutes: 'No-show grace period (minutes)',
  refund_maker_checker_threshold: 'Refund maker-checker threshold (₹)',
};

function GeneralSettings() {
  const [settings, setSettings] = useState([]);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/settings');
      setSettings(data.settings);
      setValues(Object.fromEntries(data.settings.map((s) => [s.key, s.value])));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(key) {
    setSaving(key);
    try {
      const res = await api('/api/admin/settings', { method: 'PUT', body: { key, value: Number(values[key]) } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 200 }}></div>;

  return (
    <article className="card">
      <div className="form-grid">
        {settings.map((s) => (
          <div className="field" key={s.key}>
            <label>{SETTING_LABELS[s.key] || s.key}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type="number" value={values[s.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))} />
              <button type="button" className={`btn btn--primary btn--sm${saving === s.key ? ' is-loading' : ''}`} disabled={saving === s.key} onClick={() => save(s.key)}>Save</button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function FeatureFlags() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/feature-flags');
      setFlags(data.flags);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(flag) {
    try {
      const res = await api(`/api/admin/feature-flags/${flag.id}`, { method: 'PATCH', body: { enabled: !flag.enabled } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <article className="card card--flush">
      <div className="table-wrap">
        <table className="table table--stack">
          <thead><tr><th>Flag</th><th>Scope</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4}><div className="skeleton skeleton--row"></div></td></tr>}
            {!loading && flags.length === 0 && <tr><td colSpan={4} style={{ whiteSpace: 'normal' }}><p className="text-muted">No feature flags defined yet.</p></td></tr>}
            {flags.map((f) => (
              <tr key={f.id}>
                <td data-label="Flag" className="cell-primary mono">{f.flagKey}</td>
                <td data-label="Scope">{f.hospitalName || 'Platform default'}</td>
                <td data-label="Status"><span className={`badge badge--${f.enabled ? 'confirmed' : 'cancelled'}`}>{f.enabled ? 'ON' : 'OFF'}</span></td>
                <td className="col-actions"><button type="button" className="action-btn" onClick={() => toggle(f)}><Icon name="toggle-left" />{f.enabled ? 'Turn off' : 'Turn on'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function AppVersions() {
  const [versions, setVersions] = useState([]);
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/app-versions');
      setVersions(data.versions);
      setForms(Object.fromEntries(data.versions.map((v) => [v.platform, { minSupportedVersion: v.minSupportedVersion, latestVersion: v.latestVersion, forceUpdate: v.forceUpdate, updateMessage: v.updateMessage || '' }])));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(platform) {
    setSaving(platform);
    try {
      const res = await api(`/api/admin/app-versions/${platform}`, { method: 'PUT', body: forms[platform] });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 200 }}></div>;

  return (
    <div className="two-col">
      {versions.map((v) => (
        <article className="card" key={v.platform}>
          <div className="card__head"><h2 className="card__title"><Icon name="smartphone" />{v.platform}</h2><span className="badge badge--neutral">Current: {v.currentVersion}</span></div>
          <div className="form-grid">
            <div className="field"><label>Minimum supported version</label><input className="input" value={forms[v.platform]?.minSupportedVersion || ''} onChange={(e) => setForms((f) => ({ ...f, [v.platform]: { ...f[v.platform], minSupportedVersion: e.target.value } }))} /></div>
            <div className="field"><label>Latest version</label><input className="input" value={forms[v.platform]?.latestVersion || ''} onChange={(e) => setForms((f) => ({ ...f, [v.platform]: { ...f[v.platform], latestVersion: e.target.value } }))} /></div>
            <div className="field field--full"><label className="checkbox"><input type="checkbox" checked={!!forms[v.platform]?.forceUpdate} onChange={(e) => setForms((f) => ({ ...f, [v.platform]: { ...f[v.platform], forceUpdate: e.target.checked } }))} /> Force update below minimum version</label></div>
            <div className="field field--full"><label>Update message</label><textarea className="textarea" rows={2} value={forms[v.platform]?.updateMessage || ''} onChange={(e) => setForms((f) => ({ ...f, [v.platform]: { ...f[v.platform], updateMessage: e.target.value } }))} /></div>
          </div>
          <button type="button" className={`btn btn--primary${saving === v.platform ? ' is-loading' : ''}`} disabled={saving === v.platform} onClick={() => save(v.platform)}><Icon name="check" /><span>Save</span></button>
        </article>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('general');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Platform Settings</h1>
          <p>Booking rules, feature flags and app version control.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab${tab === 'general' ? ' is-active' : ''}`} onClick={() => setTab('general')}>General</button>
        <button type="button" className={`tab${tab === 'flags' ? ' is-active' : ''}`} onClick={() => setTab('flags')}>Feature Flags</button>
        <button type="button" className={`tab${tab === 'versions' ? ' is-active' : ''}`} onClick={() => setTab('versions')}>App Versions</button>
      </div>

      {tab === 'general' && <GeneralSettings />}
      {tab === 'flags' && <FeatureFlags />}
      {tab === 'versions' && <AppVersions />}
    </>
  );
}
