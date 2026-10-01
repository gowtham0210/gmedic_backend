'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Icon from '../../../components/Icon';

const STATUS_TONE = { ACTIVE: 'confirmed', ONBOARDING: 'pending', SUSPENDED: 'cancelled', OFFBOARDED: 'neutral' };
const KYC_TONE = { VERIFIED: 'confirmed', PENDING: 'pending', UNDER_REVIEW: 'pending', REJECTED: 'cancelled' };
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

function AddHospitalModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', contactPerson: '', line1: '', city: '', state: '', pincode: '', gstin: '', registrationNumber: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/admin/hospitals', { method: 'POST', body: form });
      toast(res.message, 'success');
      onCreated();
      onClose();
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
      <div className="modal__panel modal__panel--lg">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="hospital" /></div>
            <div><h2>Add Hospital</h2><p>Start onboarding a new hospital on the platform.</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className={`field field--full${errors.name ? ' has-error' : ''}`}>
                <label>Hospital name *</label>
                <input className="input" value={form.name} onChange={set('name')} required />
                {errors.name && <p className="field__error"><Icon name="alert" className="icon--xs" />{errors.name}</p>}
              </div>
              <div className={`field${errors.phone ? ' has-error' : ''}`}>
                <label>Contact number *</label>
                <input className="input" value={form.phone} onChange={set('phone')} required />
                {errors.phone && <p className="field__error">{errors.phone}</p>}
              </div>
              <div className={`field${errors.email ? ' has-error' : ''}`}>
                <label>Email *</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} required />
                {errors.email && <p className="field__error">{errors.email}</p>}
              </div>
              <div className="field field--full">
                <label>Contact person</label>
                <input className="input" value={form.contactPerson} onChange={set('contactPerson')} />
              </div>
              <div className={`field field--full${errors.line1 ? ' has-error' : ''}`}>
                <label>Street address *</label>
                <input className="input" value={form.line1} onChange={set('line1')} required />
                {errors.line1 && <p className="field__error">{errors.line1}</p>}
              </div>
              <div className={`field${errors.city ? ' has-error' : ''}`}>
                <label>City *</label>
                <input className="input" value={form.city} onChange={set('city')} required />
              </div>
              <div className={`field${errors.state ? ' has-error' : ''}`}>
                <label>State *</label>
                <input className="input" value={form.state} onChange={set('state')} required />
              </div>
              <div className={`field${errors.pincode ? ' has-error' : ''}`}>
                <label>PIN code *</label>
                <input className="input" value={form.pincode} onChange={set('pincode')} required maxLength={6} />
                {errors.pincode && <p className="field__error">{errors.pincode}</p>}
              </div>
              <div className="field">
                <label>GSTIN</label>
                <input className="input" value={form.gstin} onChange={set('gstin')} />
              </div>
              <div className="field field--full">
                <label>Registration number</label>
                <input className="input" value={form.registrationNumber} onChange={set('registrationNumber')} />
              </div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Add Hospital</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatusModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  const { hospital, status } = target;
  const needsReason = status === 'SUSPENDED' || status === 'OFFBOARDED';

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/hospitals/${hospital.id}/status`, { method: 'PATCH', body: { status, reason } });
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
            <div className={`modal__icon ${status === 'ACTIVE' ? 'tone-green' : 'tone-red'}`}><Icon name={status === 'ACTIVE' ? 'check-circle' : 'alert'} /></div>
            <div><h2>{status === 'ACTIVE' ? 'Activate' : status === 'SUSPENDED' ? 'Suspend' : 'Offboard'} {hospital.name}?</h2>
              {status === 'SUSPENDED' && <p>New bookings will be hidden. Historical appointments and payments are kept.</p>}
            </div>
          </div>
          <div className="modal__body">
            {needsReason && (
              <div className="field">
                <label>Reason *</label>
                <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} />
              </div>
            )}
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${status === 'ACTIVE' ? 'btn--primary' : 'btn--danger'}${saving ? ' is-loading' : ''}`} disabled={saving}>Confirm</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HospitalsPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kycStatus, setKycStatus] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      if (kycStatus) qs.set('kycStatus', kycStatus);
      const data = await api(`/api/admin/hospitals?${qs}`);
      setItems(data.items);
      setSummary(data.summary);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status, kycStatus]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hospitals</h1>
          <p>Every hospital on the Gmedic platform — onboarding, status and KYC.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowAdd(true)}><Icon name="plus" />Add Hospital</button>
        </div>
      </div>

      <section className="summary-strip">
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="hospital" /></span><div><div className="mini-stat__label">Active</div><div className="mini-stat__value">{summary.ACTIVE ?? '–'}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="clock" /></span><div><div className="mini-stat__label">Onboarding</div><div className="mini-stat__value">{summary.ONBOARDING ?? '–'}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-red"><Icon name="alert" /></span><div><div className="mini-stat__label">Suspended</div><div className="mini-stat__value">{summary.SUSPENDED ?? '–'}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-violet"><Icon name="x" /></span><div><div className="mini-stat__label">Offboarded</div><div className="mini-stat__value">{summary.OFFBOARDED ?? '–'}</div></div></div>
      </section>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Hospital name, ID or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="ONBOARDING">Onboarding</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="OFFBOARDED">Offboarded</option>
            </select>
          </div>
          <div className="field toolbar__item">
            <label>KYC</label>
            <select className="select" value={kycStatus} onChange={(e) => setKycStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setStatus(''); setKycStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Hospital</th><th>Location</th><th>Doctors</th><th>Status</th><th>KYC</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="hospital" /></div><h3>No hospitals found</h3><p>Try a different search or filter, or add the first hospital.</p></div></td></tr>
              )}
              {items.map((h) => (
                <tr key={h.id}>
                  <td data-label="Hospital" className="cell-primary"><Link href={`/admin/hospitals/${h.id}`} className="text-strong">{h.name}</Link><span className="cell-sub mono">{h.id}</span></td>
                  <td data-label="Location" className="text-muted">{[h.address.city, h.address.state].filter(Boolean).join(', ') || '—'}</td>
                  <td data-label="Doctors">{h.doctorCount}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[h.status] || 'neutral'}`}>{h.status}</span></td>
                  <td data-label="KYC"><span className={`badge badge--${KYC_TONE[h.kycStatus] || 'neutral'}`}>{h.kycStatus.replace('_', ' ')}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      <Link className="action-btn" href={`/admin/hospitals/${h.id}`}><Icon name="eye" />View</Link>
                      {h.status !== 'ACTIVE' && <button type="button" className="action-btn" onClick={() => setStatusTarget({ hospital: h, status: 'ACTIVE' })}><Icon name="check" />Activate</button>}
                      {h.status === 'ACTIVE' && <button type="button" className="action-btn" onClick={() => setStatusTarget({ hospital: h, status: 'SUSPENDED' })}><Icon name="alert" />Suspend</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{items.length} hospital{items.length === 1 ? '' : 's'}</span></div>
      </article>

      <AddHospitalModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <StatusModal target={statusTarget} onClose={() => setStatusTarget(null)} onDone={load} />
    </>
  );
}
