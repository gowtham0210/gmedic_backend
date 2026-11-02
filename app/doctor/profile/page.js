'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '../../../components/Icon';
import DoctorAvatar from '../../../components/DoctorAvatar';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=DOCTOR'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function ProfilePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ bio: '', yearsExperience: '', languages: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const router = useRouter();

  // Photo: saved as soon as it is picked (or removed), like the admin doctor editor.
  async function uploadPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast('The photo must be 3 MB or smaller.', 'error');
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const r = await fetch('/api/doctor/profile/photo', { method: 'POST', body: fd, credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d.fields && d.fields.photo) || d.error || 'Could not upload the photo.');
      toast(d.message, 'success');
      setData((cur) => ({ ...cur, doctor: d.doctor }));
      router.refresh(); // the top bar avatar is server-rendered
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPhotoBusy(false);
    }
  }
  async function removePhoto() {
    setPhotoBusy(true);
    try {
      const d = await api('/api/doctor/profile/photo', { method: 'DELETE' });
      toast(d.message, 'success');
      setData((cur) => ({ ...cur, doctor: d.doctor }));
      router.refresh(); // the top bar avatar is server-rendered
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPhotoBusy(false);
    }
  }

  function load() {
    setLoading(true);
    api('/api/doctor/profile').then((d) => {
      setData(d);
      setForm({ bio: d.doctor.bio || '', yearsExperience: d.doctor.yearsExperience ?? '', languages: d.doctor.languages || '' });
    }).catch((err) => toast(err.message, 'error')).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/doctor/profile', { method: 'PUT', body: form });
      toast(res.message, 'success');
      setEditing(false);
      load();
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 400 }}></div>;
  if (!data) return <div className="alert alert--error"><Icon name="alert" /><span>Could not load your profile.</span></div>;

  const { doctor, user, hospital } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Profile</h1>
          <p>Your professional profile, as patients and the hospital see it.</p>
        </div>
      </div>

      <article className="card" style={{ marginBottom: 24 }}>
        <div className="profile-hero">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <DoctorAvatar name={doctor.name} photoUrl={doctor.photoUrl} size="xl" />
            <div className="action-group">
              <label className={`btn btn--ghost btn--sm${photoBusy ? ' is-loading' : ''}`} style={{ cursor: 'pointer' }}>
                <Icon name="upload" />{doctor.photoUrl ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/png,image/jpeg" hidden disabled={photoBusy} onChange={uploadPhoto} />
              </label>
              {doctor.photoUrl && <button type="button" className="btn btn--ghost btn--sm" style={{ color: 'var(--red-600)' }} disabled={photoBusy} onClick={removePhoto}>Remove</button>}
            </div>
          </div>
          <div className="profile-hero__main">
            <h2>{doctor.name}</h2>
            <div className="profile-hero__meta">
              <span>{doctor.specialization}</span><span className="sep"></span>
              <span className="mono">{doctor.id}</span><span className="sep"></span>
              <span className={`badge badge--${doctor.verificationStatus === 'VERIFIED' ? 'confirmed' : doctor.verificationStatus === 'REJECTED' ? 'cancelled' : 'pending'}`}>
                {doctor.verificationStatus === 'VERIFIED' ? <><Icon name="check-circle" className="icon--xs" /> Verified</> : doctor.verificationStatus}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setEditing((v) => !v)}><Icon name="pencil" /><span>{editing ? 'Close' : 'Edit Profile'}</span></button>
        </div>
      </article>

      <div className="two-col">
        <div className="dash-stack">
          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="user" />Personal Information</h2></div>
            <dl className="kv">
              <div><dt>Full name</dt><dd>{doctor.name}</dd></div>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Mobile</dt><dd>{user.phone || '—'}</dd></div>
            </dl>
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="stethoscope" />Professional Information</h2></div>
            <dl className="kv">
              <div><dt>Specialization</dt><dd>{doctor.specialization}</dd></div>
              <div><dt>Department</dt><dd>{doctor.department || '—'}</dd></div>
              <div><dt>Qualification</dt><dd>{doctor.qualifications || '—'}</dd></div>
              <div><dt>Registration number</dt><dd className="mono">{doctor.registrationNumber || '—'}</dd></div>
              <div><dt>Years of experience</dt><dd>{doctor.yearsExperience != null ? `${doctor.yearsExperience} years` : '—'}</dd></div>
              <div><dt>Languages</dt><dd>{doctor.languages || '—'}</dd></div>
              <div className="kv--full"><dt>Bio</dt><dd>{doctor.bio || '—'}</dd></div>
            </dl>
            <p className="text-muted" style={{ fontSize: 12.5, marginTop: 14, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <Icon name="info" className="icon--xs" style={{ marginTop: 2, flex: 'none' }} />
              Specialization, qualification and registration number are verified fields. Contact your hospital administrator to update them.
            </p>
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="hospital" />Hospital Information</h2></div>
            <dl className="kv">
              <div><dt>Hospital</dt><dd>{hospital.name}</dd></div>
              <div><dt>Consultation fee</dt><dd>{money(doctor.fee)}</dd></div>
            </dl>
          </article>
        </div>

        <article className="card">
          <div className="card__head"><h2 className="card__title"><Icon name="pencil" />{editing ? 'Edit Profile' : 'Editable Fields'}</h2></div>
          {editing ? (
            <form onSubmit={save}>
              <div className={`field${errors.yearsExperience ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
                <label>Years of experience</label>
                <input className="input" type="number" min="0" max="70" step="1" value={form.yearsExperience} onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value }))} placeholder="Leave empty to hide" />
                {errors.yearsExperience && <p className="field__error">{errors.yearsExperience}</p>}
              </div>
              <div className={`field${errors.languages ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
                <label>Languages spoken</label>
                <input className="input" placeholder="English, Hindi, Tamil" maxLength={120} value={form.languages} onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))} />
                {errors.languages && <p className="field__error">{errors.languages}</p>}
              </div>
              <div className={`field${errors.bio ? ' has-error' : ''}`} style={{ marginBottom: 18 }}>
                <label>Bio</label>
                <textarea className="textarea" rows={5} maxLength={500} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
                {errors.bio && <p className="field__error">{errors.bio}</p>}
              </div>
              <button type="submit" className={`btn btn--primary btn--block${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Save Changes</span></button>
            </form>
          ) : (
            <p className="text-muted">Click Edit Profile to update your bio, years of experience and languages spoken.</p>
          )}
        </article>
      </div>
    </>
  );
}
