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

function GenerateModal({ open, hospitals, onClose, onCreated }) {
  const [form, setForm] = useState({ hospitalId: '', deskLabel: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/admin/qr', { method: 'POST', body: form });
      toast(res.message, 'success');
      onCreated();
      onClose();
      setForm({ hospitalId: '', deskLabel: '' });
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
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="qr-code" /></div>
            <div><h2>Generate QR Code</h2></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className={`field${errors.hospitalId ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
              <label>Hospital *</label>
              <select className="select" value={form.hospitalId} onChange={(e) => setForm((f) => ({ ...f, hospitalId: e.target.value }))} required>
                <option value="">Select hospital</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              {errors.hospitalId && <p className="field__error">{errors.hospitalId}</p>}
            </div>
            <div className={`field${errors.deskLabel ? ' has-error' : ''}`}>
              <label>Desk / label *</label>
              <input className="input" value={form.deskLabel} onChange={(e) => setForm((f) => ({ ...f, deskLabel: e.target.value }))} placeholder="e.g. Front Desk" required />
              {errors.deskLabel && <p className="field__error">{errors.deskLabel}</p>}
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Generate</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RevokeModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/qr/${target.id}/revoke`, { method: 'POST', body: { reason } });
      toast(res.message, 'success');
      onDone();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="alert" /></div>
            <div><h2>Revoke QR for {target.hospitalName}?</h2><p>{target.deskLabel}</p></div>
          </div>
          <div className="modal__body">
            <div className="field"><label>Reason *</label><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} /></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--danger${saving ? ' is-loading' : ''}`} disabled={saving}>Revoke</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const POSTER_W = 1060;
const POSTER_H = 1500;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the QR poster.'));
    img.src = src;
  });
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Preview + download for one QR code: the branded poster (rasterised to a
// 2120×3000 PNG in the browser, same as the Receptionist portal) or the bare QR.
function DownloadModal({ target, onClose }) {
  const [busy, setBusy] = useState('');
  if (!target) return null;
  const base = `/api/admin/qr/${encodeURIComponent(target.id)}`;
  const slug = `gmedic-qr-${target.id.toLowerCase()}-${`${target.hospitalName}-${target.deskLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  async function fetchOk(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not generate the QR code.');
    return res;
  }

  async function downloadPoster() {
    setBusy('poster');
    let svgUrl;
    try {
      const res = await fetchOk(`${base}/poster.svg`);
      svgUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'image/svg+xml' }));
      const img = await loadImage(svgUrl);
      await new Promise((r) => setTimeout(r, 120)); // let embedded fonts settle
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = POSTER_W * scale;
      canvas.height = POSTER_H * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not create the PNG file.');
      saveBlob(blob, `${slug}-poster.png`);
      toast('QR poster downloaded.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      setBusy('');
    }
  }

  async function downloadQr() {
    setBusy('qr');
    try {
      const res = await fetchOk(`${base}/qr.png?size=2048`);
      saveBlob(await res.blob(), `${slug}.png`);
      toast('QR code downloaded.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="qr-download-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--poster">
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="qr-code" /></div>
          <div><h2 id="qr-download-title">Download QR · {target.deskLabel}</h2><p>{target.hospitalName} · <span className="mono">{target.id}</span></p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body">
          <div className="qr-download__preview">
            <img src={`${base}/poster.svg`} alt={`Skip the Queue poster for ${target.hospitalName}, ${target.deskLabel}`} />
          </div>
          <p className="qr-download__link">Opens <span className="mono">{target.link}</span></p>
        </div>
        <div className="modal__foot">
          <button type="button" className={`btn btn--ghost${busy === 'qr' ? ' is-loading' : ''}`} disabled={!!busy} onClick={downloadQr}><Icon name="qr-code" /><span>QR only (PNG)</span></button>
          <button type="button" className={`btn btn--primary${busy === 'poster' ? ' is-loading' : ''}`} disabled={!!busy} onClick={downloadPoster}><Icon name="download" /><span>Download poster</span></button>
        </div>
      </div>
    </div>
  );
}

export default function QrPage() {
  const [items, setItems] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hospitalId, setHospitalId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [downloadTarget, setDownloadTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (hospitalId) qs.set('hospitalId', hospitalId);
      if (status) qs.set('status', status);
      if (q) qs.set('q', q);
      const data = await api(`/api/admin/qr?${qs}`);
      setItems(data.items);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [hospitalId, status, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/api/admin/hospitals?pageSize=100').then((d) => setHospitals(d.items)).catch(() => {}); }, []);
  useEffect(() => { api('/api/admin/qr/analytics').then(setAnalytics).catch(() => {}); }, []);

  async function reissue(qr) {
    try {
      const res = await api(`/api/admin/qr/${qr.id}/reissue`, { method: 'POST' });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const totalScans = analytics ? analytics.series.reduce((s, d) => s + d.linked + d.alreadyLinked + d.failed, 0) : 0;
  const totalLinked = analytics ? analytics.series.reduce((s, d) => s + d.linked, 0) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>QR Management</h1>
          <p>Generate, revoke and monitor QR codes hospitals display at the front desk.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowGenerate(true)}><Icon name="plus" />Generate QR</button>
        </div>
      </div>

      {analytics && (
        <section className="summary-strip">
          <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="scan" /></span><div><div className="mini-stat__label">Scans (14d)</div><div className="mini-stat__value">{totalScans}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Linked</div><div className="mini-stat__value">{totalLinked}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="alert-triangle" /></span><div><div className="mini-stat__label">Spikes flagged</div><div className="mini-stat__value">{analytics.spikes.length}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-violet"><Icon name="qr-code" /></span><div><div className="mini-stat__label">Active codes</div><div className="mini-stat__value">{items.filter((i) => i.status === 'ACTIVE').length}</div></div></div>
        </section>
      )}

      {analytics && analytics.spikes.length > 0 && (
        <div className="alert alert--error" style={{ marginBottom: 20 }}>
          <Icon name="alert-triangle" />
          <span>Unusual scan activity: {analytics.spikes.map((s) => `${s.hospitalName} (${s.lastDay} scans in 24h, avg ${s.dailyAvg})`).join('; ')}</span>
        </div>
      )}

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Hospital, desk or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Hospital</label>
            <select className="select" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
              <option value="">All</option>
              {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setHospitalId(''); setStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>QR</th><th>Hospital</th><th>Desk</th><th>Scans</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="qr-code" /></div><h3>No QR codes found</h3><p>Generate the first QR code for a hospital.</p></div></td></tr>
              )}
              {items.map((qr) => (
                <tr key={qr.id}>
                  <td data-label="QR" className="cell-primary mono">{qr.id}</td>
                  <td data-label="Hospital" className="text-muted">{qr.hospitalName}</td>
                  <td data-label="Desk">{qr.deskLabel}</td>
                  <td data-label="Scans">{qr.scanCount}</td>
                  <td data-label="Status"><span className={`badge badge--${qr.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{qr.status}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      {qr.status === 'ACTIVE' && <button type="button" className="action-btn" onClick={() => setDownloadTarget(qr)}><Icon name="download" />Download</button>}
                      {qr.status === 'ACTIVE' && <button type="button" className="action-btn" onClick={() => setRevokeTarget(qr)}><Icon name="alert" />Revoke</button>}
                      {qr.status === 'ACTIVE' && <button type="button" className="action-btn" onClick={() => reissue(qr)}><Icon name="refresh" />Reissue</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{items.length} QR code{items.length === 1 ? '' : 's'}</span></div>
      </article>

      <GenerateModal open={showGenerate} hospitals={hospitals} onClose={() => setShowGenerate(false)} onCreated={load} />
      <RevokeModal target={revokeTarget} onClose={() => setRevokeTarget(null)} onDone={load} />
      <DownloadModal target={downloadTarget} onClose={() => setDownloadTarget(null)} />
    </>
  );
}
