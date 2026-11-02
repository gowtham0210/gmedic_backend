'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import usePermissions from '../../../components/admin/usePermissions';
import useHospitalOptions from '../../../components/admin/useHospitalOptions';

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

function GeneralSettings({ canEdit }) {
  const [settings, setSettings] = useState([]);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/settings');
      setSettings(data.settings);
      setValues(Object.fromEntries(data.settings.map((s) => [s.key, String(s.value)])));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(key) {
    setSaving(key);
    setErrors((e) => ({ ...e, [key]: '' }));
    try {
      const res = await api('/api/admin/settings', { method: 'PUT', body: { key, value: values[key] } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      if (err.fields && err.fields.value) setErrors((e) => ({ ...e, [key]: err.fields.value })); else toast(err.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 200 }}></div>;

  return (
    <>
      <div className="alert alert--info" style={{ marginBottom: 16 }}><Icon name="info" /><span>The booking token applies to every hospital. The booking window is a default: a hospital that has its own booking policy (on its hospital page) uses that instead, and new hospitals start with it.</span></div>
      <article className="card">
        <div className="form-grid">
          {settings.map((s) => (
            <div className={`field${errors[s.key] ? ' has-error' : ''}`} key={s.key}>
              <label>{s.label} <span className="text-muted">({s.unit})</span>{s.isDefault && <span className="badge badge--neutral" style={{ marginLeft: 8 }}>default</span>}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" type="number" min={s.min} max={s.max} step="1" value={values[s.key] ?? ''} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))} />
                {canEdit && <button type="button" className={`btn btn--primary btn--sm${saving === s.key ? ' is-loading' : ''}`} disabled={saving === s.key || String(s.value) === String(values[s.key])} onClick={() => save(s.key)}>Save</button>}
              </div>
              {errors[s.key] ? <p className="field__error">{errors[s.key]}</p> : <p className="field__hint">{s.help} ({s.min} to {s.max}.)</p>}
            </div>
          ))}
        </div>
      </article>
    </>
  );
}

// A flag is a platform default plus optional per-hospital overrides. A flag with nothing built behind it can't be switched on.
function FeatureFlags({ canEdit }) {
  const [data, setData] = useState(null);
  const hospitals = useHospitalOptions();
  const [adding, setAdding] = useState({});

  const load = useCallback(async () => {
    try { setData(await api('/api/admin/feature-flags')); } catch (err) { toast(err.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function set(flagKey, hospitalId, enabled) {
    try { const res = await api('/api/admin/feature-flags', { method: 'POST', body: { flagKey, hospitalId: hospitalId || null, enabled } }); toast(res.message, 'success'); load(); } catch (err) { toast(err.message, 'error'); }
  }
  async function removeOverride(o) {
    try { const res = await api(`/api/admin/feature-flags/${o.id}`, { method: 'DELETE' }); toast(res.message, 'success'); load(); } catch (err) { toast(err.message, 'error'); }
  }

  if (!data) return <div className="skeleton" style={{ height: 200 }}></div>;
  return (
    <div className="dash-stack">
      {data.flags.map((f) => {
        const choice = adding[f.flagKey] || { hospitalId: '', enabled: 'true' };
        const free = hospitals.filter((h) => h.status !== 'OFFBOARDED' && !f.overrides.some((o) => o.hospitalId === h.id));
        return (
          <article className="card" key={f.flagKey}>
            <div className="card__head">
              <h2 className="card__title"><Icon name="toggle-left" />{f.label}</h2>
              {!f.implemented && <span className="badge badge--neutral">Not available yet</span>}
            </div>
            <p className="text-muted" style={{ fontSize: 13, margin: '0 0 12px' }}>{f.description}{!f.implemented && ' Nothing in the apps uses this yet, so it can\'t be turned on.'}</p>
            <dl className="kv">
              <div><dt>Platform default</dt><dd>
                <span className={`badge badge--${f.platformEnabled ? 'confirmed' : 'cancelled'}`}>{f.platformEnabled ? 'ON' : 'OFF'}</span>{' '}
                {canEdit && f.implemented && <button type="button" className="action-btn" onClick={() => set(f.flagKey, null, !f.platformEnabled)}>{f.platformEnabled ? 'Turn off' : 'Turn on'}</button>}
              </dd></div>
            </dl>
            {f.implemented && (
              <>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', margin: '16px 0 8px' }}>Hospital overrides</h3>
                {f.overrides.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No overrides: every hospital follows the platform default.</p>}
                {f.overrides.map((o) => (
                  <div key={o.id} className="kv" style={{ marginBottom: 6 }}><div><dt>{o.hospitalName}</dt><dd>
                    <span className={`badge badge--${o.enabled ? 'confirmed' : 'cancelled'}`}>{o.enabled ? 'ON' : 'OFF'}</span>{' '}
                    {canEdit && <><button type="button" className="action-btn" onClick={() => set(f.flagKey, o.hospitalId, !o.enabled)}>{o.enabled ? 'Turn off' : 'Turn on'}</button><button type="button" className="action-btn" onClick={() => removeOverride(o)}><Icon name="x" />Remove override</button></>}
                  </dd></div></div>
                ))}
                {canEdit && free.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <select className="select" style={{ maxWidth: 260 }} value={choice.hospitalId} onChange={(e) => setAdding((a) => ({ ...a, [f.flagKey]: { ...choice, hospitalId: e.target.value } }))}>
                      <option value="">Add an override for…</option>
                      {free.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                    <select className="select" style={{ maxWidth: 110 }} value={choice.enabled} onChange={(e) => setAdding((a) => ({ ...a, [f.flagKey]: { ...choice, enabled: e.target.value } }))}>
                      <option value="true">On</option><option value="false">Off</option>
                    </select>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={!choice.hospitalId} onClick={() => { set(f.flagKey, choice.hospitalId, choice.enabled === 'true'); setAdding((a) => ({ ...a, [f.flagKey]: undefined })); }}>Add override</button>
                  </div>
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function AppVersions({ canEdit }) {
  const [versions, setVersions] = useState([]);
  const [forms, setForms] = useState({});
  const [errors, setErrors] = useState({});
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
    setErrors((e) => ({ ...e, [platform]: {} }));
    try {
      const res = await api(`/api/admin/app-versions/${platform}`, { method: 'PUT', body: forms[platform] });
      toast(res.message, 'success');
      load();
    } catch (err) {
      if (err.fields) setErrors((e) => ({ ...e, [platform]: err.fields })); else toast(err.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 200 }}></div>;
  const set = (platform, k) => (e) => setForms((f) => ({ ...f, [platform]: { ...f[platform], [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } }));

  return (
    <>
      <div className="alert alert--info" style={{ marginBottom: 16 }}><Icon name="info" /><span>The apps ask <span className="mono">GET /api/patient/app-version?platform=ANDROID&amp;version=1.3.0</span> when they start. A build below the minimum must update only when &quot;Force update&quot; is on; any build below the latest is told an update is available.</span></div>
      <div className="two-col">
        {versions.map((v) => {
          const err = errors[v.platform] || {};
          return (
            <article className="card" key={v.platform}>
              <div className="card__head"><h2 className="card__title"><Icon name="smartphone" />{v.platform}</h2><span className="badge badge--neutral">Current: {v.currentVersion}</span></div>
              <div className="form-grid">
                <div className={`field${err.minSupportedVersion ? ' has-error' : ''}`}><label>Minimum supported version</label><input className="input mono" placeholder="1.2.0" value={forms[v.platform]?.minSupportedVersion || ''} disabled={!canEdit} onChange={set(v.platform, 'minSupportedVersion')} />{err.minSupportedVersion && <p className="field__error">{err.minSupportedVersion}</p>}</div>
                <div className={`field${err.latestVersion ? ' has-error' : ''}`}><label>Latest version</label><input className="input mono" placeholder="1.4.0" value={forms[v.platform]?.latestVersion || ''} disabled={!canEdit} onChange={set(v.platform, 'latestVersion')} />{err.latestVersion && <p className="field__error">{err.latestVersion}</p>}</div>
                <div className="field field--full"><label className="checkbox"><input type="checkbox" checked={!!forms[v.platform]?.forceUpdate} disabled={!canEdit} onChange={set(v.platform, 'forceUpdate')} /> Force update below minimum version</label></div>
                <div className={`field field--full${err.updateMessage ? ' has-error' : ''}`}><label>Update message</label><textarea className="textarea" rows={2} maxLength={300} value={forms[v.platform]?.updateMessage || ''} disabled={!canEdit} onChange={set(v.platform, 'updateMessage')} />{err.updateMessage && <p className="field__error">{err.updateMessage}</p>}</div>
              </div>
              {canEdit && <button type="button" className={`btn btn--primary${saving === v.platform ? ' is-loading' : ''}`} disabled={saving === v.platform} onClick={() => save(v.platform)}><Icon name="check" /><span>Save</span></button>}
            </article>
          );
        })}
      </div>
    </>
  );
}

const TABS = [['general', 'General', 'settings.view'], ['flags', 'Feature Flags', 'feature_flags.view'], ['versions', 'App Versions', 'app_versions.view']];

export default function SettingsPage() {
  const can = usePermissions();
  const allowed = TABS.filter(([, , perm]) => can(perm));
  const [picked, setTab] = useState(null);
  // Operations can manage feature flags without seeing general settings, so open the first tab they may use.
  const tab = allowed.some(([key]) => key === picked) ? picked : (allowed[0] || [])[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Platform Settings</h1>
          <p>Booking rules, feature flags and app version control.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        {allowed.map(([key, label]) => (
          <button key={key} type="button" className={`tab${tab === key ? ' is-active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'general' && <GeneralSettings canEdit={can('settings.manage')} />}
      {tab === 'flags' && <FeatureFlags canEdit={can('feature_flags.manage')} />}
      {tab === 'versions' && <AppVersions canEdit={can('app_versions.manage')} />}
    </>
  );
}
