'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

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
    if (doctor) setForm({ specialization: doctor.specialization, fee: doctor.fee, department: doctor.department || '', qualifications: doctor.qualifications || '', registrationNumber: doctor.registrationNumber || '' });
  }, [doctor]);

  if (!doctor || !form) return null;

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
            <div className="form-grid">
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
                <input className="input" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
              </div>
              <div className="field">
                <label>Registration number</label>
                <input className="input" value={form.registrationNumber} onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))} />
                {doctor.verificationStatus === 'VERIFIED' && form.registrationNumber.trim() !== (doctor.registrationNumber || '').trim() && (
                  <p className="field__hint is-warning"><Icon name="alert-triangle" className="icon--xs" />Saving will send this doctor back to Pending for re-verification.</p>
                )}
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

export default function DoctorsPage() {
  const [items, setItems] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (hospitalId) qs.set('hospitalId', hospitalId);
      if (specialization) qs.set('specialization', specialization);
      if (verificationStatus) qs.set('verificationStatus', verificationStatus);
      qs.set('pageSize', '100');
      const data = await api(`/api/admin/doctors?${qs}`);
      setItems(data.items);
      setSpecializations(data.specializations || []);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, hospitalId, specialization, verificationStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/api/admin/hospitals?pageSize=100').then((d) => setHospitals(d.items)).catch(() => {}); }, []);

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
            <thead><tr><th>Doctor</th><th>Hospital</th><th>Specialization</th><th className="num">Consultation Fee</th><th>Availability</th><th>Verification</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="stethoscope" /></div><h3>No doctors found</h3><p>Try a different search or filter.</p></div></td></tr>
              )}
              {items.map((d) => (
                <tr key={d.id}>
                  <td data-label="Doctor" className="cell-primary">{d.name}<span className="cell-sub mono">{d.id}</span></td>
                  <td data-label="Hospital" className="text-muted">{d.hospitalName}</td>
                  <td data-label="Specialization">{d.specialization}</td>
                  <td data-label="Consultation Fee" className="num fee">₹{Number(d.fee).toLocaleString('en-IN')}</td>
                  <td data-label="Availability"><span className={`badge badge--${d.availability === 'present' ? 'confirmed' : 'cancelled'}`}>{d.availability === 'present' ? 'Present' : 'Absent'}</span></td>
                  <td data-label="Verification"><span className={`badge badge--${VERIFY_TONE[d.verificationStatus] || 'neutral'}`}>{d.verificationStatus}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      <button type="button" className="action-btn" onClick={() => openEdit(d)}><Icon name="pencil" />Edit</button>
                      {d.verificationStatus !== 'VERIFIED' && <button type="button" className="action-btn" onClick={() => setVerifyTarget({ doctor: d, status: 'VERIFIED' })}><Icon name="check" />Verify</button>}
                      {d.verificationStatus !== 'REJECTED' && <button type="button" className="action-btn" onClick={() => setVerifyTarget({ doctor: d, status: 'REJECTED' })}><Icon name="x" />Reject</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} doctor{total === 1 ? '' : 's'}</span></div>
      </article>

      <EditModal doctor={editing} specializations={specializations} onClose={() => setEditing(null)} onDone={load} />
      <VerifyModal target={verifyTarget} onClose={() => setVerifyTarget(null)} onDone={load} />
    </>
  );
}
