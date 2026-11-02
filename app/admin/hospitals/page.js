'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '../../../components/Icon';
import HospitalStatusModal from '../../../components/admin/HospitalStatusModal';
import usePermissions from '../../../components/admin/usePermissions';
import Pager, { usePager } from '../../../components/admin/Pager';

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
  // Creation captures the basics only; GSTIN, registration no. and documents are
  // KYC, added later on the hospital's page (KYC & Documents).
  const [form, setForm] = useState({ name: '', phone: '', email: '', contactPerson: '', line1: '', city: '', state: '', pincode: '' });
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
            <div><h2>Add Hospital</h2><p>Create the hospital and start onboarding. KYC details and documents are added later on the hospital&apos;s page.</p></div>
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


function HospitalsPage() {
  const can = usePermissions();
  // Filters can be preset from the URL, e.g. the dashboard's "needs attention" links.
  const params = useSearchParams();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(() => params.get('status') || '');
  const [kycStatus, setKycStatus] = useState(() => params.get('kycStatus') || '');
  const [showAdd, setShowAdd] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const [page, setPage] = usePager(JSON.stringify([q, status, kycStatus]));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      if (kycStatus) qs.set('kycStatus', kycStatus);
      qs.set('pageSize', '25');
      qs.set('page', String(page));
      const data = await api(`/api/admin/hospitals?${qs}`);
      setItems(data.items);
      setTotal(data.total); setPages(data.pages || 1);
      setSummary(data.summary);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status, kycStatus, page]);

  useEffect(() => { load(); }, [load]);

  // Empty-state context: the status summary is platform-wide (unfiltered), so it
  // tells "no hospitals at all" apart from "nothing matches the filters".
  const platformTotal = Object.values(summary).reduce((t, n) => t + Number(n || 0), 0);
  const STATUS_LABEL = { ONBOARDING: 'Onboarding', ACTIVE: 'Active', SUSPENDED: 'Suspended', OFFBOARDED: 'Offboarded' };
  const KYC_LABEL = { PENDING: 'Pending', UNDER_REVIEW: 'Under review', VERIFIED: 'Verified', REJECTED: 'Rejected' };
  const activeFilters = [
    q && `“${q}”`,
    status && `status ${STATUS_LABEL[status]}`,
    kycStatus && `KYC ${KYC_LABEL[kycStatus]}`,
  ].filter(Boolean);
  const resetFilters = () => { setQ(''); setStatus(''); setKycStatus(''); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hospitals</h1>
          <p>Every hospital on the Gmedic platform — onboarding, status and KYC.</p>
        </div>
        <div className="page-head__actions">
          {can('hospitals.manage') && <button type="button" className="btn btn--primary" onClick={() => setShowAdd(true)}><Icon name="plus" />Add Hospital</button>}
        </div>
      </div>

      {/* Status summary: compact, so the hospital table stays the primary working area.
          Colour only when a status actually has hospitals in it (design-system §6). */}
      <section className="summary-strip summary-strip--compact" aria-label="Hospitals by status">
        {[
          { key: 'ACTIVE', label: 'Active', icon: 'hospital', tone: 'tone-green' },
          { key: 'ONBOARDING', label: 'Onboarding', icon: 'clock', tone: 'tone-amber' },
          { key: 'SUSPENDED', label: 'Suspended', icon: 'ban', tone: 'tone-red' },
          { key: 'OFFBOARDED', label: 'Offboarded', icon: 'x', tone: 'tone-neutral' },
        ].map((s) => (
          <div key={s.key} className="card mini-stat">
            <span className={`stat__icon ${summary[s.key] > 0 ? s.tone : 'tone-neutral'}`}><Icon name={s.icon} /></span>
            <div><div className="mini-stat__label">{s.label}</div><div className="mini-stat__value">{summary[s.key] ?? '–'}</div></div>
          </div>
        ))}
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
          <button type="button" className="btn btn--ghost" onClick={resetFilters}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Hospital</th><th>Location</th><th>Doctors</th><th>Status</th><th>KYC</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}>
                  {platformTotal === 0 ? (
                    <div className="empty">
                      <div className="empty__icon"><Icon name="hospital" /></div>
                      <h3>No hospitals yet</h3>
                      <p>Hospitals you onboard will appear here with their status and KYC.</p>
                      {can('hospitals.manage') && <button type="button" className="btn btn--primary" style={{ marginTop: 14 }} onClick={() => setShowAdd(true)}><Icon name="plus" />Add Hospital</button>}
                    </div>
                  ) : (
                    <div className="empty">
                      <div className="empty__icon"><Icon name="search" /></div>
                      <h3>No hospitals match your search</h3>
                      <p>Nothing matches {activeFilters.join(' · ')}. {q ? 'Check the spelling or clear the filters.' : 'Try a different status or KYC filter.'}</p>
                      <button type="button" className="btn btn--ghost" style={{ marginTop: 14 }} onClick={resetFilters}><Icon name="refresh" />Clear filters</button>
                    </div>
                  )}
                </td></tr>
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
                      {can('hospitals.manage') && (h.nextStatuses || []).map((next) => (
                        <button key={next} type="button" className="action-btn" disabled={next === 'ACTIVE' && h.kycStatus !== 'VERIFIED'} title={next === 'ACTIVE' && h.kycStatus !== 'VERIFIED' ? 'Verify KYC first' : undefined} onClick={() => setStatusTarget({ hospital: h, status: next })}>
                          <Icon name={next === 'ACTIVE' ? 'check' : next === 'SUSPENDED' ? 'ban' : 'alert'} />{next === 'ACTIVE' ? 'Activate' : next === 'SUSPENDED' ? 'Suspend' : 'Offboard'}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} pages={pages} noun="hospital" onPage={setPage} />
      </article>

      <AddHospitalModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <HospitalStatusModal target={statusTarget} onClose={() => setStatusTarget(null)} onDone={load} />
    </>
  );
}

// useSearchParams needs a Suspense boundary for the production build.
export default function HospitalsPageRoute() {
  return <Suspense fallback={null}><HospitalsPage /></Suspense>;
}
