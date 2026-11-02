'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from '../../../components/Icon';
import useHospitalOptions from '../../../components/admin/useHospitalOptions';
import usePermissions from '../../../components/admin/usePermissions';
import Pager, { usePager } from '../../../components/admin/Pager';
import CredentialsModal from '../../../components/admin/CredentialsModal';

const VERIFY_TONE = { VERIFIED: 'confirmed', PENDING: 'pending', REJECTED: 'cancelled' };
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

function EditModal({ doctor, specializations, onClose, onDone }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (doctor) setForm({ name: doctor.name, bio: doctor.bio || '', specialization: doctor.specialization, fee: doctor.fee, department: doctor.department || '', qualifications: doctor.qualifications || '', registrationNumber: doctor.registrationNumber || '', branchId: doctor.branchId || '' });
  }, [doctor]);
  // Active branches of the doctor's hospital (plus the current one, even if it was deactivated).
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    if (!doctor) return;
    api(`/api/admin/hospitals/${doctor.hospitalId}/departments`).then((d) => setDepartments(d.departments.filter((x) => !x.archived))).catch(() => setDepartments([]));
    api(`/api/admin/hospitals/${doctor.hospitalId}/branches`).then((d) => setBranches(d.branches.filter((b) => b.status === 'ACTIVE' || b.id === doctor.branchId))).catch(() => setBranches([]));
  }, [doctor?.id, doctor?.hospitalId]);

  const [photo, setPhoto] = useState(null);
  useEffect(() => { if (doctor) setPhoto(doctor.photoUrl || null); }, [doctor]);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!doctor || !form) return null;

  async function uploadPhoto(file) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const body = new FormData();
      body.append('photo', file);
      const res = await fetch(`/api/admin/doctors/${doctor.id}/photo`, { method: 'POST', body, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not upload the photo.');
      setPhoto(data.doctor.photoUrl);
      toast(data.message, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPhotoBusy(false);
    }
  }
  async function removePhoto() {
    setPhotoBusy(true);
    try {
      const res = await api(`/api/admin/doctors/${doctor.id}/photo`, { method: 'DELETE' });
      setPhoto(null);
      toast(res.message, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api(`/api/admin/doctors/${doctor.id}`, { method: 'PUT', body: form });
      toast(res.message, 'success');
      onDone();
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
      <div className="modal__panel">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="stethoscope" /></div>
            <div><h2>{doctor.name}</h2><p>{doctor.hospitalName} · {doctor.id}</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
              {photo
                ? <img src={photo} alt={doctor.name} width="64" height="64" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} />
                : <span className="avatar avatar--lg">{doctor.name.replace(/^Dr\.?\s*/i, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}</span>}
              <div className="action-group">
                <label className={`btn btn--ghost btn--sm${photoBusy ? ' is-loading' : ''}`} style={{ cursor: 'pointer' }}>
                  <Icon name="upload" />{photo ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { uploadPhoto(e.target.files[0]); e.target.value = ''; }} />
                </label>
                {photo && <button type="button" className="btn btn--ghost btn--sm" style={{ color: 'var(--red-600)' }} disabled={photoBusy} onClick={removePhoto}>Remove</button>}
              </div>
              <span className="field__hint">PNG, JPEG or WebP, up to 3 MB. Shown to patients.</span>
            </div>
            <div className="form-grid">
              <div className={`field field--full${errors.name ? ' has-error' : ''}`}>
                <label>Name</label>
                <input className="input" value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                {errors.name && <p className="field__error">{errors.name}</p>}
              </div>
              <div className="field">
                <label>Specialization</label>
                <select className="select" value={form.specialization} onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}>
                  {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className={`field${errors.fee ? ' has-error' : ''}`}>
                <label>Consultation fee (₹)</label>
                <input className="input" type="number" value={form.fee} onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))} />
                {errors.fee && <p className="field__error">{errors.fee}</p>}
              </div>
              <div className="field">
                <label>Department</label>
                <input className="input" list="doctor-departments" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                <datalist id="doctor-departments">{departments.map((d) => <option key={d.id} value={d.name} />)}</datalist>
                <p className="field__hint">One of this hospital&apos;s departments; a new name adds it to the hospital.</p>
              </div>
              <div className={`field${errors.registrationNumber ? ' has-error' : ''}`}>
                <label>Registration number</label>
                <input className="input" value={form.registrationNumber} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))} />
                {errors.registrationNumber && <p className="field__error">{errors.registrationNumber}</p>}
                {doctor.verificationStatus === 'VERIFIED' && form.registrationNumber.trim() !== (doctor.registrationNumber || '').trim() && (
                  <p className="field__hint is-warning"><Icon name="alert-triangle" className="icon--xs" />Saving will send this doctor back to Pending for re-verification.</p>
                )}
              </div>
              <div className={`field${errors.branchId ? ' has-error' : ''}`}>
                <label>Branch</label>
                <select className="select" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">Main hospital (no branch)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.status !== 'ACTIVE' ? ' (deactivated)' : ''}</option>)}
                </select>
                {errors.branchId ? <p className="field__error">{errors.branchId}</p> : <p className="field__hint">Doctors at a deactivated branch can&apos;t be booked.</p>}
              </div>
              <div className={`field field--full${errors.bio ? ' has-error' : ''}`}>
                <label>About (shown to patients)</label>
                <textarea className="textarea" rows={3} maxLength={1000} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
                {errors.bio && <p className="field__error">{errors.bio}</p>}
              </div>
              <div className="field field--full">
                <label>Qualifications</label>
                <input className="input" value={form.qualifications} onChange={(e) => setForm((f) => ({ ...f, qualifications: e.target.value }))} />
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

function VerifyModal({ target, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  const { doctor, status } = target;
  const needsNote = status === 'REJECTED';

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/doctors/${doctor.id}/verification`, { method: 'PATCH', body: { status, note } });
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
            <div className={`modal__icon ${status === 'VERIFIED' ? 'tone-green' : 'tone-red'}`}><Icon name={status === 'VERIFIED' ? 'check-circle' : 'alert'} /></div>
            <div><h2>{status === 'VERIFIED' ? 'Verify' : 'Reject'} {doctor.name}?</h2></div>
          </div>
          <div className="modal__body">
            {needsNote && (
              <div className="field">
                <label>Reason *</label>
                <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} required rows={3} placeholder="Enter the reason for rejecting this doctor…" />
              </div>
            )}
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${status === 'VERIFIED' ? 'btn--primary' : 'btn--danger'}${saving ? ' is-loading' : ''}`} disabled={saving}>{status === 'VERIFIED' ? 'Verify Doctor' : 'Reject Doctor'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Deactivate a doctor who left (or bring them back). Shows the upcoming appointments left behind.
function DoctorStatusModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [impact, setImpact] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setReason(''); setError(''); setImpact(null);
    if (target) api(`/api/admin/doctors/${target.id}/status`).then(setImpact).catch(() => {});
  }, [target]);
  if (!target) return null;
  const deactivating = target.status !== 'INACTIVE';
  async function submit(e) {
    e.preventDefault();
    if (deactivating && !reason.trim()) return setError('Enter a reason.');
    setSaving(true);
    try {
      const res = await api(`/api/admin/doctors/${target.id}/status`, { method: 'PATCH', body: { status: deactivating ? 'INACTIVE' : 'ACTIVE', reason } });
      toast(res.message, 'success');
      onClose(); onDone();
    } catch (err) {
      if (err.fields && err.fields.reason) setError(err.fields.reason); else toast(err.message, 'error');
    } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="doc-status-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit} noValidate>
          <div className="modal__head">
            <div className={`modal__icon ${deactivating ? 'tone-red' : 'tone-green'}`}><Icon name={deactivating ? 'user-x' : 'user-check'} /></div>
            <div><h2 id="doc-status-title">{deactivating ? 'Deactivate' : 'Reactivate'} {target.name}?</h2>
              <p>{deactivating ? 'They stop appearing to patients and staff for new bookings, and their portal login is locked. History is kept.' : 'They can be booked again. Their portal login stays as it is.'}</p></div>
          </div>
          {deactivating && (
            <div className="modal__body">
              <p className="note" style={{ marginTop: 0, marginBottom: 14 }}><Icon name="info" /><span>{impact
                ? (impact.upcomingAppointments ? `${impact.upcomingAppointments} upcoming appointment${impact.upcomingAppointments === 1 ? '' : 's'} (${impact.firstDate}${impact.lastDate !== impact.firstDate ? ` to ${impact.lastDate}` : ''}) will still need to be moved or cancelled by the hospital.` : 'No upcoming appointments are booked with this doctor.')
                : 'Checking upcoming appointments…'}</span></p>
              <div className={`field${error ? ' has-error' : ''}`}>
                <label>Reason *</label>
                <textarea className="textarea" rows={3} maxLength={300} value={reason} placeholder="e.g. Left the hospital on 30 Sep" onChange={(e) => { setReason(e.target.value); setError(''); }} />
                {error && <p className="field__error">{error}</p>}
              </div>
            </div>
          )}
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${deactivating ? 'btn--danger' : 'btn--primary'}${saving ? ' is-loading' : ''}`} disabled={saving}>{deactivating ? 'Deactivate Doctor' : 'Reactivate Doctor'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Invite a doctor to sign in to the doctor portal (one login per doctor).
function InviteLoginModal({ doctor, onClose, onDone }) {
  const [form, setForm] = useState({ email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm({ email: '', phone: '' }); setErrors({}); }, [doctor]);
  if (!doctor) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api(`/api/admin/doctors/${doctor.id}/login`, { method: 'POST', body: form });
      toast(res.message, 'success');
      onClose();
      onDone(res.credentials);
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="invite-login-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit} noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="user-plus" /></div>
            <div><h2 id="invite-login-title">Invite to doctor portal</h2><p>{doctor.name} · {doctor.hospitalName}. They get a temporary password to change at first sign-in.</p></div>
          </div>
          <div className="modal__body">
            <div className={`field${errors.email ? ' has-error' : ''}`}><label>Email *</label><input className="input" type="email" value={form.email} onChange={set('email')} placeholder="doctor@hospital.in" />{errors.email && <p className="field__error">{errors.email}</p>}</div>
            <div className={`field${errors.phone ? ' has-error' : ''}`} style={{ marginTop: 14 }}><label>Phone</label><input className="input" value={form.phone} onChange={set('phone')} />{errors.phone && <p className="field__error">{errors.phone}</p>}</div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="user-plus" /><span>Invite Doctor</span></button>
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
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="doc-confirm-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className={`modal__icon ${confirm.danger ? 'tone-red' : 'tone-amber'}`}><Icon name={confirm.icon} /></div>
            <div><h2 id="doc-confirm-title">{confirm.title}</h2><p>{confirm.body}</p></div>
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

function DoctorsPage() {
  const can = usePermissions();
  // Filters can be preset from the URL, e.g. the dashboard's "needs attention" links.
  const params = useSearchParams();
  const [items, setItems] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const hospitals = useHospitalOptions();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [hospitalId, setHospitalId] = useState(() => params.get('hospitalId') || '');
  const [specialization, setSpecialization] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(() => params.get('verificationStatus') || '');
  const [editing, setEditing] = useState(null);

  // Open with the row's data, then load the doctor's latest details into the form.
  function openEdit(d) {
    setEditing(d);
    api(`/api/admin/doctors/${d.id}`)
      .then((r) => setEditing((cur) => (cur && cur.id === d.id ? { ...cur, ...r.doctor } : cur)))
      .catch(() => {});
  }
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [total, setTotal] = useState(0);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [creds, setCreds] = useState(null);

  async function loginAction(d, path, method, body) {
    try {
      const res = await api(`/api/admin/doctors/${d.id}/login${path}`, { method, body });
      toast(res.message, 'success');
      if (res.credentials) setCreds(res.credentials);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const [page, setPage] = usePager(JSON.stringify([q, hospitalId, specialization, verificationStatus]));
  const [pages, setPages] = useState(1);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (hospitalId) qs.set('hospitalId', hospitalId);
      if (specialization) qs.set('specialization', specialization);
      if (verificationStatus) qs.set('verificationStatus', verificationStatus);
      qs.set('pageSize', '25');
      qs.set('page', String(page));
      const data = await api(`/api/admin/doctors?${qs}`);
      setItems(data.items);
      setSpecializations(data.specializations || []);
      setTotal(data.total); setPages(data.pages || 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, hospitalId, specialization, verificationStatus, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Doctors</h1>
          <p>Every doctor across every hospital on the platform.</p>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Name or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Hospital</label>
            <select className="select" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
              <option value="">All</option>
              {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Specialization</label>
            <select className="select" value={specialization} onChange={(e) => setSpecialization(e.target.value)}>
              <option value="">All</option>
              {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Verification</label>
            <select className="select" value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setHospitalId(''); setSpecialization(''); setVerificationStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Doctor</th><th>Hospital</th><th>Specialization</th><th className="num">Consultation Fee</th><th>Availability</th><th>Verification</th><th>Portal login</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="stethoscope" /></div><h3>No doctors found</h3><p>Try a different search or filter.</p></div></td></tr>
              )}
              {items.map((d) => (
                <tr key={d.id}>
                  <td data-label="Doctor" className="cell-primary">{d.name}<span className="cell-sub mono">{d.id}</span></td>
                  <td data-label="Hospital" className="text-muted">{d.hospitalName}</td>
                  <td data-label="Specialization">{d.specialization}</td>
                  <td data-label="Consultation Fee" className="num fee">₹{Number(d.fee).toLocaleString('en-IN')}</td>
                  <td data-label="Availability"><span className={`badge badge--${d.availability === 'present' ? 'confirmed' : 'cancelled'}`}>{d.availability === 'present' ? 'Present' : 'Absent'}</span></td>
                  <td data-label="Verification"><span className={`badge badge--${VERIFY_TONE[d.verificationStatus] || 'neutral'}`}>{d.verificationStatus}</span>{d.status === 'INACTIVE' && <span className="badge badge--cancelled" style={{ marginLeft: 6 }} title={d.statusReason || ''}>Inactive</span>}</td>
                  <td data-label="Portal login">
                    {!d.portalLogin ? <span className="text-muted">Not invited</span> : (
                      <><span className={`badge badge--${d.portalLogin.status === 'ACTIVE' ? 'confirmed' : 'cancelled'}`}>{d.portalLogin.status === 'ACTIVE' ? (d.portalLogin.mustChangePassword ? 'Invited' : 'Active') : 'Inactive'}</span><span className="cell-sub">{d.portalLogin.email}</span></>
                    )}
                  </td>
                  <td className="col-actions">
                    <div className="action-group">
                      {can('doctors.manage') && <button type="button" className="action-btn" onClick={() => openEdit(d)}><Icon name="pencil" />Edit</button>}
                      {can('doctors.verify') && d.verificationStatus !== 'VERIFIED' && <button type="button" className="action-btn" onClick={() => setVerifyTarget({ doctor: d, status: 'VERIFIED' })}><Icon name="check" />Verify</button>}
                      {can('doctors.verify') && d.verificationStatus !== 'REJECTED' && <button type="button" className="action-btn" onClick={() => setVerifyTarget({ doctor: d, status: 'REJECTED' })}><Icon name="x" />Reject</button>}
                      {can('doctors.manage') && <button type="button" className="action-btn" onClick={() => setStatusTarget(d)}><Icon name={d.status === 'INACTIVE' ? 'user-check' : 'user-x'} />{d.status === 'INACTIVE' ? 'Reactivate' : 'Deactivate'}</button>}
                      {can('doctors.manage') && !d.portalLogin && <button type="button" className="action-btn" onClick={() => setInviteTarget(d)}><Icon name="user-plus" />Invite</button>}
                      {can('doctors.manage') && d.portalLogin && d.portalLogin.status === 'ACTIVE' && (
                        <button type="button" className="action-btn" onClick={() => setConfirm({ title: `Reset ${d.name}'s portal password?`, body: 'The current password stops working and any open session ends. You will get a temporary password to share.', action: 'Reset Password', icon: 'lock', run: () => loginAction(d, '/reset-password', 'POST') })}><Icon name="lock" />Reset Login</button>
                      )}
                      {can('doctors.manage') && d.portalLogin && (
                        <button type="button" className="action-btn" onClick={() => (d.portalLogin.status === 'ACTIVE'
                          ? setConfirm({ title: `Deactivate ${d.name}'s portal login?`, body: 'They can no longer sign in to the doctor portal and any open session ends. Their appointments and queue are not affected.', action: 'Deactivate Login', icon: 'user-x', danger: true, run: () => loginAction(d, '/status', 'PATCH', { status: 'INACTIVE' }) })
                          : loginAction(d, '/status', 'PATCH', { status: 'ACTIVE' }))}><Icon name={d.portalLogin.status === 'ACTIVE' ? 'user-x' : 'user-check'} />{d.portalLogin.status === 'ACTIVE' ? 'Disable Login' : 'Enable Login'}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} pages={pages} noun="doctor" onPage={setPage} />
      </article>

      <EditModal doctor={editing} specializations={specializations} onClose={() => setEditing(null)} onDone={load} />
      <VerifyModal target={verifyTarget} onClose={() => setVerifyTarget(null)} onDone={load} />
      <DoctorStatusModal target={statusTarget} onClose={() => setStatusTarget(null)} onDone={load} />
      <InviteLoginModal doctor={inviteTarget} onClose={() => setInviteTarget(null)} onDone={(c) => { setCreds(c); load(); }} />
      <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </>
  );
}

// useSearchParams needs a Suspense boundary for the production build.
export default function DoctorsPageRoute() {
  return <Suspense fallback={null}><DoctorsPage /></Suspense>;
}
