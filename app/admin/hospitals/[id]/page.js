'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import Icon from '../../../../components/Icon';
import HospitalStatusModal from '../../../../components/admin/HospitalStatusModal';
import usePermissions from '../../../../components/admin/usePermissions';
import { formatDate } from '../../../../lib/format';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const KYC_OPTIONS = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'];
const KYC_ID_FIELDS = [
  { field: 'gstin', label: 'GSTIN', inputClass: 'input mono', maxLength: 15, placeholder: 'e.g. 29ABCDE1234F1Z5', normalize: (v) => v.toUpperCase() },
  { field: 'registrationNumber', label: 'Registration number', inputClass: 'input', maxLength: 40, placeholder: 'Hospital registration no.', normalize: (v) => v },
];
const DOC_TYPES = { LICENCE: 'Hospital Licence', BANK_PROOF: 'Bank Proof', GST_CERTIFICATE: 'GST Certificate', REGISTRATION: 'Registration' };

// Confirms a KYC or document decision; a rejection needs a reason.
function DecisionModal({ decision, onClose }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setReason(''); setError(''); }, [decision]);
  if (!decision) return null;
  async function submit(e) {
    e.preventDefault();
    if (!decision.optional && !reason.trim()) return setError('Enter a reason.');
    setSaving(true);
    try { await decision.run(reason.trim()); onClose(); } catch { /* the toast already explains */ } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit} noValidate>
          <div className="modal__head">
            <div className={`modal__icon ${decision.danger ? 'tone-red' : 'tone-teal'}`}><Icon name={decision.danger ? 'alert' : 'check-circle'} /></div>
            <div><h2 id="decision-title">{decision.title}</h2><p>{decision.body}</p></div>
          </div>
          {!decision.noReason && <div className="modal__body">
            <div className={`field${error ? ' has-error' : ''}`}>
              <label>{decision.reasonLabel}</label>
              <textarea className="textarea" rows={3} maxLength={300} value={reason} placeholder={decision.placeholder || ''} onChange={(e) => { setReason(e.target.value); setError(''); }} />
              {error && <p className="field__error">{error}</p>}
            </div>
          </div>}
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${decision.danger ? 'btn--danger' : 'btn--primary'}${saving ? ' is-loading' : ''}`} disabled={saving}>{decision.action}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HospitalDetailPage({ params }) {
  const can = usePermissions();
  const { id } = use(params);
  const [hospital, setHospital] = useState(null);
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kycChecklist, setKycChecklist] = useState([]);
  const [decision, setDecision] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [editBranch, setEditBranch] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState('');
  const [deptError, setDeptError] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [branchErrors, setBranchErrors] = useState({});
  const [savingKyc, setSavingKyc] = useState(false);
  const [kycForm, setKycForm] = useState({ gstin: '', registrationNumber: '' });
  const [kycErrors, setKycErrors] = useState({});
  const [savingKycDetails, setSavingKycDetails] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(null);
  const [removingKyc, setRemovingKyc] = useState(null);
  const [upload, setUpload] = useState({ docType: 'LICENCE', file: null });
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [logoBusy, setLogoBusy] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', contactPerson: '' });
  const [savingBranch, setSavingBranch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [infoForm, setInfoForm] = useState(null);
  const [infoErrors, setInfoErrors] = useState({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [policy, setPolicy] = useState(null);
  const [policyForm, setPolicyForm] = useState(null);
  const [policyErrors, setPolicyErrors] = useState({});
  const [savingPolicy, setSavingPolicy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, docs, br] = await Promise.all([
        api(`/api/admin/hospitals/${id}`),
        api(`/api/admin/hospitals/${id}/documents`).catch(() => ({ documents: [] })),
        api(`/api/admin/hospitals/${id}/branches`).catch(() => ({ branches: [] })),
      ]);
      api(`/api/admin/hospitals/${id}/departments`).then((d) => setDepartments(d.departments)).catch(() => {});
      api(`/api/admin/hospitals/${id}/policy`).then((d) => {
        setPolicy(d);
        setPolicyForm({ cancellationWindowHours: d.policy.cancellationWindowHours, refundPercent: d.policy.refundPercent, bookingWindowDays: d.policy.bookingWindowDays });
      }).catch(() => {});
      setHospital(detail.hospital);
      setKycChecklist(detail.kycChecklist || []);
      setStats(detail.stats);
      setDocuments(docs.documents || []);
      setBranches(br.branches || []);
      setKycForm({ gstin: detail.hospital.gstin || '', registrationNumber: detail.hospital.registrationNumber || '' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function savePolicy(e) {
    e.preventDefault();
    setSavingPolicy(true);
    setPolicyErrors({});
    try {
      const res = await api(`/api/admin/hospitals/${id}/policy`, { method: 'PUT', body: policyForm });
      toast(res.message, 'success');
      setPolicy((p) => ({ ...p, policy: res.policy }));
    } catch (err) {
      setPolicyErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSavingPolicy(false);
    }
  }

  async function saveKyc(status, reason = '') {
    setSavingKyc(true);
    try {
      const res = await api(`/api/admin/hospitals/${id}/kyc`, { method: 'PATCH', body: { status, reason } });
      toast(res.message, 'success');
      setHospital(res.hospital);
      if (res.kycChecklist) setKycChecklist(res.kycChecklist);
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    } finally {
      setSavingKyc(false);
    }
  }


  async function saveKycDetails(e) {
    e.preventDefault();
    setSavingKycDetails(true);
    setKycErrors({});
    try {
      // A blank field keeps the stored value (the server never clears on save); removing is removeKycField.
      const res = await api(`/api/admin/hospitals/${id}`, { method: 'PUT', body: { gstin: kycForm.gstin.trim().toUpperCase(), registrationNumber: kycForm.registrationNumber.trim() } });
      toast(res.kycReviewRequired ? res.message : 'KYC details saved.', 'success');
      setHospital(res.hospital);
      setKycForm({ gstin: res.hospital.gstin || '', registrationNumber: res.hospital.registrationNumber || '' });
    } catch (err) {
      setKycErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSavingKycDetails(false);
    }
  }

  // Removing a GSTIN / registration number is its own action and needs a second click to confirm.
  async function removeKycField(field) {
    if (removeArmed !== field) {
      setRemoveArmed(field);
      setTimeout(() => setRemoveArmed((f) => (f === field ? null : f)), 4000);
      return;
    }
    setRemoveArmed(null);
    setRemovingKyc(field);
    setKycErrors({});
    try {
      const res = await api(`/api/admin/hospitals/${id}`, { method: 'PUT', body: { clear: [field] } });
      toast(res.kycReviewRequired ? res.message : `${KYC_ID_FIELDS.find((f) => f.field === field).label} removed.`, 'success');
      setHospital(res.hospital);
      setKycForm((f) => ({ ...f, [field]: '' }));
    } catch (err) {
      setKycErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setRemovingKyc(null);
    }
  }

  async function uploadDocument(e) {
    e.preventDefault();
    if (!upload.file) return toast('Choose a PDF, PNG or JPEG file (max 8MB).', 'error');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('docType', upload.docType);
      body.append('file', upload.file);
      const res = await api(`/api/admin/hospitals/${id}/documents`, { method: 'POST', body });
      toast(res.message, 'success');
      setUpload((u) => ({ ...u, file: null }));
      setFileInputKey((k) => k + 1);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function withdrawDocument(docId, reason) {
    try {
      const res = await api(`/api/admin/hospitals/${id}/documents/${docId}/withdraw`, { method: 'POST', body: { reason } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  }

  async function reviewDocument(docId, status, reason = null) {
    try {
      const res = await api(`/api/admin/hospitals/${id}/documents/${docId}`, { method: 'PATCH', body: { status, reason } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  }


  function startEdit() {
    setInfoErrors({});
    setInfoForm({
      name: hospital.name, contactPerson: hospital.contactPerson || '', phone: hospital.phone, email: hospital.email,
      line1: hospital.address.line1 || '', city: hospital.address.city || '', state: hospital.address.state || '', pincode: hospital.address.pincode || '',
      about: hospital.about || '',
    });
    setEditing(true);
  }

  async function saveInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    try {
      // Every field is sent: required ones must stay filled, and a cleared contact person is removed.
      setInfoErrors({});
      const body = Object.fromEntries(Object.entries(infoForm).map(([k, v]) => [k, String(v).trim()]));
      const res = await api(`/api/admin/hospitals/${id}`, { method: 'PUT', body });
      toast(res.message, 'success');
      setHospital(res.hospital);
      setEditing(false);
    } catch (err) {
      setInfoErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSavingInfo(false);
    }
  }

  // Logo: multipart upload straight from the file picker; replacing deletes the old file.
  async function uploadLogo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast('The logo must be 3 MB or smaller.', 'error');
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const r = await fetch(`/api/admin/hospitals/${id}/logo`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data.fields && data.fields.logo) || data.error || 'Could not upload the logo.');
      toast(data.message, 'success');
      setHospital(data.hospital);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      const res = await api(`/api/admin/hospitals/${id}/logo`, { method: 'DELETE' });
      toast(res.message, 'success');
      setHospital(res.hospital);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLogoBusy(false);
    }
  }

  async function setBranchStatus(branch, status) {
    try {
      const res = await api(`/api/admin/branches/${branch.id}`, { method: 'PATCH', body: { status } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  }

  // Deactivating asks first and says what it affects: doctors there stop taking bookings.
  async function toggleBranch(branch) {
    if (branch.status !== 'ACTIVE') return setBranchStatus(branch, 'ACTIVE');
    const usage = await api(`/api/admin/branches/${branch.id}/usage`).catch(() => null);
    setDecision({
      title: `Deactivate ${branch.name}?`,
      body: usage ? `${usage.doctors} doctor${usage.doctors === 1 ? '' : 's'} at this branch will stop taking bookings, and ${usage.activeQrCodes} QR code${usage.activeQrCodes === 1 ? '' : 's'} point here. You can activate it again later.` : 'Doctors at this branch will stop taking bookings. You can activate it again later.',
      action: 'Deactivate Branch', danger: true, optional: true, noReason: true,
      run: () => setBranchStatus(branch, 'INACTIVE'),
    });
  }

  async function addDepartment(e) {
    e.preventDefault();
    setDeptError('');
    try {
      const res = await api(`/api/admin/hospitals/${id}/departments`, { method: 'POST', body: { name: newDept.trim() } });
      toast(res.message, 'success');
      setNewDept('');
      load();
    } catch (err) {
      if (err.fields && err.fields.name) setDeptError(err.fields.name); else toast(err.message, 'error');
    }
  }

  async function updateDepartment(dep, body) {
    try {
      const res = await api(`/api/admin/departments/${dep.id}`, { method: 'PATCH', body });
      toast(res.message, 'success');
      setRenaming(null);
      load();
    } catch (err) {
      toast(err.fields ? Object.values(err.fields)[0] : err.message, 'error');
    }
  }

  async function saveBranchEdit(e) {
    e.preventDefault();
    setBranchErrors({});
    try {
      const res = await api(`/api/admin/branches/${editBranch.id}`, { method: 'PATCH', body: { name: editBranch.name.trim(), address: editBranch.address.trim(), phone: editBranch.phone.trim(), contactPerson: (editBranch.contactPerson || '').trim() } });
      toast(res.message, 'success');
      setEditBranch(null);
      load();
    } catch (err) {
      setBranchErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    }
  }

  async function addBranch(e) {
    e.preventDefault();
    setSavingBranch(true);
    try {
      await api(`/api/admin/hospitals/${id}/branches`, { method: 'POST', body: branchForm });
      toast('Branch added.', 'success');
      setBranchForm({ name: '', address: '', phone: '', contactPerson: '' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingBranch(false);
    }
  }

  if (loading && !hospital) return <div className="skeleton" style={{ height: 300 }}></div>;
  if (!hospital) return <div className="alert alert--error"><Icon name="alert" /><span>Hospital not found.</span></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb"><Link href="/admin/hospitals">Hospitals</Link><Icon name="chevron-right" /><span>{hospital.name}</span></nav>
          <h1>{hospital.name}</h1>
          <p>Hospital ID: <span className="mono">{hospital.id}</span> · <span className={`badge badge--${hospital.status === 'ACTIVE' ? 'confirmed' : hospital.status === 'ONBOARDING' ? 'pending' : 'cancelled'}`}>{hospital.status}</span>{hospital.statusReason && hospital.status !== 'ACTIVE' ? <span className="text-muted"> — {hospital.statusReason}</span> : null}</p>
        </div>
        {can('hospitals.manage') && (hospital.nextStatuses || []).length > 0 && (
          <div className="page-head__actions">
            {hospital.nextStatuses.map((next) => (
              <button key={next} type="button" className={`btn ${next === 'ACTIVE' ? 'btn--primary' : 'btn--ghost'}`} style={next === 'ACTIVE' ? undefined : { color: 'var(--red-600)' }}
                disabled={next === 'ACTIVE' && hospital.kycStatus !== 'VERIFIED'} title={next === 'ACTIVE' && hospital.kycStatus !== 'VERIFIED' ? 'Verify KYC first' : undefined}
                onClick={() => setStatusTarget({ hospital, status: next })}>
                <Icon name={next === 'ACTIVE' ? 'check' : next === 'SUSPENDED' ? 'ban' : 'alert'} />{next === 'ACTIVE' ? 'Activate' : next === 'SUSPENDED' ? 'Suspend' : 'Offboard'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="kpi"><span>Branches</span><strong>{stats.branches}</strong></div>
        <div className="kpi"><span>Doctors</span><strong>{stats.doctors}</strong></div>
        <div className="kpi"><span>Receptionists</span><strong>{stats.receptionists}</strong></div>
        <div className="kpi"><span>Appointments</span><strong>{stats.appointments}</strong></div>
      </div>

      <div className="two-col">
        <div className="dash-stack">
          <article className="card">
            <div className="card__head">
              <h2 className="card__title"><Icon name="hospital" />Hospital Information</h2>
              {!editing && can('hospitals.manage') && <button type="button" className="btn btn--ghost btn--sm" onClick={startEdit}><Icon name="pencil" />Edit</button>}
            </div>
            {editing && infoForm && (
              <form onSubmit={saveInfo} className="form-grid" noValidate>
                {[['name', 'Hospital name *', true], ['phone', 'Phone *'], ['email', 'Email *'], ['contactPerson', 'Contact person (optional)'], ['pincode', 'PIN code *'], ['city', 'City *'], ['state', 'State *'], ['line1', 'Street address *', true]].map(([k, label, full]) => (
                  <div className={`field${full ? ' field--full' : ''}${infoErrors[k] ? ' has-error' : ''}`} key={k}>
                    <label>{label}</label>
                    <input className="input" value={infoForm[k]} onChange={(e) => setInfoForm((f) => ({ ...f, [k]: e.target.value }))} />
                    {infoErrors[k] && <p className="field__error">{infoErrors[k]}</p>}
                  </div>
                ))}
                <div className={`field field--full${infoErrors.about ? ' has-error' : ''}`}>
                  <label>About (shown to patients in the app)</label>
                  <textarea className="textarea" rows={3} maxLength={600} value={infoForm.about} onChange={(e) => setInfoForm((f) => ({ ...f, about: e.target.value }))} placeholder="A short description of the hospital" />
                  {infoErrors.about && <p className="field__error">{infoErrors.about}</p>}
                </div>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
                  <button type="submit" className={`btn btn--primary${savingInfo ? ' is-loading' : ''}`} disabled={savingInfo}><Icon name="check" />Save</button>
                </div>
              </form>
            )}
            {!editing && <dl className="kv">
              <div><dt>Status</dt><dd>{hospital.status}{hospital.statusReason ? ` — ${hospital.statusReason}` : ''}</dd></div>
              <div><dt>Phone</dt><dd>{hospital.phone}</dd></div>
              <div><dt>Email</dt><dd>{hospital.email}</dd></div>
              <div><dt>Contact person</dt><dd>{hospital.contactPerson || '—'}</dd></div>
              <div className="kv--full"><dt>Address</dt><dd>{[hospital.address.line1, hospital.address.city, hospital.address.state, hospital.address.pincode].filter(Boolean).join(', ')}</dd></div>
              <div className="kv--full"><dt>About</dt><dd style={{ whiteSpace: 'pre-line' }}>{hospital.about || '—'}</dd></div>
              <div className="kv--full"><dt>Logo</dt><dd>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {hospital.logoUrl
                    ? <img src={hospital.logoUrl} alt={`${hospital.name} logo`} style={{ width: 56, height: 56, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
                    : <span className="text-muted">No logo</span>}
                  {can('hospitals.manage') && <>
                    <label className={`btn btn--ghost btn--sm${logoBusy ? ' is-loading' : ''}`} style={{ cursor: 'pointer' }}>
                      <Icon name="upload" />{hospital.logoUrl ? 'Replace' : 'Upload logo'}
                      <input type="file" accept="image/png,image/jpeg" hidden disabled={logoBusy} onChange={uploadLogo} />
                    </label>
                    {hospital.logoUrl && <button type="button" className="btn btn--ghost btn--sm" disabled={logoBusy} onClick={removeLogo}><Icon name="x" />Remove</button>}
                  </>}
                </div>
                <small className="text-muted">PNG or JPEG, up to 3 MB. Shown in the patient app and the hospital&apos;s portal.</small>
              </dd></div>
            </dl>}
          </article>

          <article className="card">
            <div className="card__head"><div><h2 className="card__title"><Icon name="clipboard-list" />KYC &amp; Documents</h2><p className="card__subtitle">Verification · legal details, documents and decision</p></div><span className={`badge badge--${hospital.kycStatus === 'VERIFIED' ? 'confirmed' : hospital.kycStatus === 'REJECTED' ? 'cancelled' : 'pending'}`}>{hospital.kycStatus.replace('_', ' ')}</span></div>
            <form className="kyc-section" onSubmit={saveKycDetails}>
              <h3 className="kyc-section__title">KYC details</h3>
              <div className="form-grid">
                {KYC_ID_FIELDS.map(({ field, label, inputClass, maxLength, placeholder, normalize }) => {
                  const stored = hospital[field] || '';
                  const typed = kycForm[field].trim();
                  return (
                    <div key={field} className={`field${kycErrors[field] ? ' has-error' : ''}`}>
                      <label>{label}</label>
                      <input className={inputClass} value={kycForm[field]} maxLength={maxLength} placeholder={placeholder} onChange={(e) => setKycForm((f) => ({ ...f, [field]: normalize(e.target.value) }))} />
                      {kycErrors[field] && <p className="field__error">{kycErrors[field]}</p>}
                      {stored && !typed && <p className="field__hint">Left blank, the current {label} ({stored}) is kept. Use Remove to delete it.</p>}
                      {hospital.kycStatus === 'VERIFIED' && typed && normalize(typed) !== stored && (
                        <p className="field__hint is-warning"><Icon name="alert-triangle" className="icon--xs" />Saving will send KYC back to Under review.</p>
                      )}
                      {stored && can('hospitals.manage') && (
                        <button type="button" className={`btn btn--ghost btn--sm${removingKyc === field ? ' is-loading' : ''}`} style={{ color: 'var(--red-600)', alignSelf: 'flex-start', marginTop: 6 }} disabled={Boolean(removingKyc)} onClick={() => removeKycField(field)}>
                          <Icon name="x" />{removeArmed === field ? (hospital.kycStatus === 'VERIFIED' ? 'Click again — KYC goes back to review' : 'Click again to remove') : `Remove ${label}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="kyc-section__actions">
                {can('hospitals.manage') && <button type="submit" className={`btn btn--ghost btn--sm${savingKycDetails ? ' is-loading' : ''}`} disabled={savingKycDetails}><Icon name="check" />Save details</button>}
              </div>
            </form>

            <form className="kyc-section" onSubmit={uploadDocument}>
              <h3 className="kyc-section__title">Documents</h3>
              <div className="kyc-upload">
                <select className="select" aria-label="Document type" value={upload.docType} onChange={(e) => setUpload((u) => ({ ...u, docType: e.target.value }))}>
                  {Object.entries(DOC_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <input key={fileInputKey} className="input" type="file" aria-label="Document file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files[0] || null }))} />
                <button type="submit" className={`btn btn--primary btn--sm${uploading ? ' is-loading' : ''}`} disabled={uploading || !upload.file || !can('kyc.manage')}><Icon name="upload" />Upload</button>
              </div>
              <p className="kyc-section__hint">PDF, PNG or JPEG, up to 8 MB. Uploading moves KYC from Pending to Under review.</p>
            </form>

            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Document</th><th>File</th><th>Status</th><th className="col-actions">Review</th></tr></thead>
                <tbody>
                  {documents.length === 0 && <tr><td colSpan={4} style={{ whiteSpace: 'normal' }}><p className="text-muted">No documents uploaded yet.</p></td></tr>}
                  {documents.map((d) => (
                    <tr key={d.id} style={d.status === 'WITHDRAWN' ? { opacity: 0.6 } : undefined}>
                      <td data-label="Document">{DOC_TYPES[d.docType] || d.docType}</td>
                      <td data-label="File" className="text-muted"><a href={`/api/admin/hospitals/${id}/documents/${d.id}`} target="_blank" rel="noreferrer">{d.fileName}</a></td>
                      <td data-label="Status">
                        <span className={`badge badge--${d.status === 'VERIFIED' ? 'confirmed' : d.status === 'REJECTED' ? 'cancelled' : d.status === 'WITHDRAWN' ? 'neutral' : 'pending'}`}>{d.status}</span>
                        {d.status === 'REJECTED' && d.rejectionReason && <span className="cell-sub">{d.rejectionReason}</span>}
                        {d.status === 'WITHDRAWN' && d.withdrawnReason && <span className="cell-sub">Withdrawn: {d.withdrawnReason}</span>}
                      </td>
                      <td className="col-actions">
                        {d.status !== 'WITHDRAWN' && can('kyc.manage') && (
                          <div className="action-group">
                            {d.status !== 'VERIFIED' && <button type="button" className="action-btn" onClick={() => reviewDocument(d.id, 'VERIFIED').catch(() => {})}><Icon name="check" />Verify</button>}
                            {d.status !== 'REJECTED' && <button type="button" className="action-btn" onClick={() => setDecision({ title: `Reject ${DOC_TYPES[d.docType] || d.docType}?`, body: 'The hospital will need to upload a new copy. The reason is shown on this document.', action: 'Reject Document', danger: true, reasonLabel: 'Reason *', placeholder: 'Enter the reason for rejecting this document…', run: (reason) => reviewDocument(d.id, 'REJECTED', reason) })}><Icon name="x" />Reject</button>}
                            <button type="button" className="action-btn" onClick={() => setDecision({ title: `Withdraw ${DOC_TYPES[d.docType] || d.docType}?`, body: 'It stops counting towards KYC. The file is kept for the audit trail and cannot be restored; upload a new copy if needed.', action: 'Withdraw Document', danger: true, reasonLabel: 'Reason *', placeholder: 'e.g. Wrong file uploaded…', run: (reason) => withdrawDocument(d.id, reason) })}><Icon name="ban" />Withdraw</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="kyc-section__title">KYC decision</h3>
            <ul className="kyc-checklist" style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 6 }}>
              {kycChecklist.map((c) => (
                <li key={c.docType} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                  <span>{c.label}</span>
                  <span className={`badge badge--${c.status === 'VERIFIED' ? 'confirmed' : c.status === 'REJECTED' ? 'cancelled' : c.status === 'MISSING' ? 'neutral' : 'pending'}`}>{c.status === 'MISSING' ? 'Not uploaded' : c.status}</span>
                </li>
              ))}
            </ul>
            {hospital.kycReason && <p className="note" style={{ marginTop: 0, marginBottom: 12 }}><Icon name="info" /><span>Last decision{hospital.kycDecidedAt ? ` (${formatDate(hospital.kycDecidedAt)})` : ''}: {hospital.kycReason}</span></p>}
            {(() => {
              const ready = kycChecklist.length > 0 && kycChecklist.every((c) => c.status === 'VERIFIED');
              return (
                <>
                  <div className="action-group">
                    {KYC_OPTIONS.map((s) => (
                      <button key={s} type="button" className={`btn btn--sm ${s === hospital.kycStatus ? 'btn--primary' : 'btn--ghost'}`}
                        disabled={savingKyc || !can('kyc.manage') || s === hospital.kycStatus || (s === 'VERIFIED' && !ready)}
                        onClick={() => setDecision(s === 'REJECTED'
                          ? { title: 'Reject KYC?', body: `${hospital.name} stays unable to go live until KYC is verified. The reason is shown on this page.`, action: 'Reject KYC', danger: true, reasonLabel: 'Reason *', placeholder: 'Enter the reason for rejecting KYC…', run: (reason) => saveKyc('REJECTED', reason) }
                          : { title: `Set KYC to ${s.replace('_', ' ').toLowerCase()}?`, body: s === 'VERIFIED' ? 'Every required document is verified. The hospital can then be activated.' : 'The hospital goes back into review.', action: s === 'VERIFIED' ? 'Verify KYC' : 'Update KYC', reasonLabel: 'Note (optional)', optional: true, run: (reason) => saveKyc(s, reason) })}>
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  {!ready && hospital.kycStatus !== 'VERIFIED' && <p className="field__hint" style={{ marginTop: 8 }}>Verified is available once every required document above is verified.</p>}
                </>
              );
            })()}
          </article>

          <article className="card">
            <div className="card__head"><div><h2 className="card__title"><Icon name="stethoscope" />Departments</h2><p className="card__subtitle">Shown to patients when they pick a doctor. Archived ones are hidden; their doctors keep the label.</p></div></div>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Department</th><th className="num">Doctors</th><th>Status</th><th className="col-actions">Action</th></tr></thead>
                <tbody>
                  {departments.length === 0 && <tr><td colSpan={4}><p className="text-muted">No departments yet.</p></td></tr>}
                  {departments.map((d) => (
                    <tr key={d.id} style={d.archived ? { opacity: 0.6 } : undefined}>
                      <td data-label="Department">{renaming && renaming.id === d.id
                        ? <input className="input" autoFocus value={renaming.name} maxLength={60} onChange={(e) => setRenaming((r) => ({ ...r, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') updateDepartment(d, { name: renaming.name.trim() }); if (e.key === 'Escape') setRenaming(null); }} />
                        : d.name}</td>
                      <td data-label="Doctors" className="num">{d.doctors}</td>
                      <td data-label="Status"><span className={`badge badge--${d.archived ? 'neutral' : 'confirmed'}`}>{d.archived ? 'Archived' : 'Active'}</span></td>
                      <td className="col-actions">{can('hospitals.manage') && (
                        <div className="action-group">
                          {renaming && renaming.id === d.id
                            ? <><button type="button" className="action-btn" onClick={() => updateDepartment(d, { name: renaming.name.trim() })}><Icon name="check" />Save</button><button type="button" className="action-btn" onClick={() => setRenaming(null)}>Cancel</button></>
                            : <><button type="button" className="action-btn" onClick={() => setRenaming({ id: d.id, name: d.name })}><Icon name="pencil" />Rename</button>
                              <button type="button" className="action-btn" onClick={() => updateDepartment(d, { archived: !d.archived })}>{d.archived ? 'Restore' : 'Archive'}</button></>}
                        </div>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {can('hospitals.manage') && (
              <form onSubmit={addDepartment} className="form-grid" noValidate>
                <div className={`field field--full${deptError ? ' has-error' : ''}`}><label>New department</label><input className="input" value={newDept} maxLength={60} placeholder="e.g. Neurology" onChange={(e) => { setNewDept(e.target.value); setDeptError(''); }} />{deptError && <p className="field__error">{deptError}</p>}</div>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}><button type="submit" className="btn btn--primary" disabled={!newDept.trim()}><Icon name="plus" />Add Department</button></div>
              </form>
            )}
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="building" />Branches</h2></div>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Branch</th><th>Address</th><th>Phone</th><th>Status</th><th className="col-actions">Action</th></tr></thead>
                <tbody>
                  {branches.length === 0 && <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><p className="text-muted">No branches yet — this hospital operates from its main address.</p></td></tr>}
                  {branches.map((b) => (
                    <tr key={b.id}><td data-label="Branch">{b.name}</td><td data-label="Address" className="text-muted">{b.address}</td><td data-label="Phone">{b.phone}</td><td data-label="Status"><span className={`badge badge--${b.status === 'ACTIVE' ? 'confirmed' : 'neutral'}`}>{b.status}</span></td><td className="col-actions">{can('branches.manage') && <div className="action-group"><button type="button" className="action-btn" onClick={() => { setBranchErrors({}); setEditBranch({ ...b, contactPerson: b.contactPerson || '' }); }}><Icon name="pencil" />Edit</button><button type="button" className="action-btn" onClick={() => toggleBranch(b)}>{b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></div>}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {can('branches.manage') && <form onSubmit={addBranch} className="form-grid">
              <div className="field"><label>Branch name</label><input className="input" required value={branchForm.name} onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="field"><label>Phone</label><input className="input" required value={branchForm.phone} onChange={(e) => setBranchForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div className="field field--full"><label>Address</label><input className="input" required value={branchForm.address} onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))} /></div>
              <div className="field field--full"><label>Contact person (optional)</label><input className="input" value={branchForm.contactPerson} onChange={(e) => setBranchForm((f) => ({ ...f, contactPerson: e.target.value }))} /></div>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className={`btn btn--primary${savingBranch ? ' is-loading' : ''}`} disabled={savingBranch}><Icon name="plus" />Add Branch</button>
              </div>
            </form>}
          </article>
        </div>

        <article className="card">
          <div className="card__head">
            <div><h2 className="card__title"><Icon name="calendar-check" />Booking policy</h2><p className="card__subtitle">How far ahead patients can book this hospital in the app.</p></div>
            {policy && <span className={`badge badge--${policy.policy.custom ? 'confirmed' : 'neutral'}`}>{policy.policy.custom ? 'Custom' : 'Platform default'}</span>}
          </div>
          {policyForm && (
            <form onSubmit={savePolicy} noValidate>
              {[
                // The cancellation window and refund percentage are kept as saved but not shown: the booking token
                // is never refunded, so they no longer change anything.
                ['bookingWindowDays', 'Patients can book up to (days ahead)', 1, 180, null],
              ].map(([key, label, min, max, hint]) => (
                <div key={key} className={`field${policyErrors[key] ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
                  <label>{label}</label>
                  <input className="input" type="number" min={min} max={max} value={policyForm[key]} disabled={!can('hospitals.manage')} onChange={(e) => setPolicyForm((f) => ({ ...f, [key]: e.target.value }))} />
                  {policyErrors[key] ? <p className="field__error">{policyErrors[key]}</p> : hint && <p className="field__hint">{hint}</p>}
                </div>
              ))}
              {!policy.policy.custom && <p className="field__hint" style={{ marginBottom: 12 }}>This hospital uses the platform default ({policy.defaults.bookingWindowDays} days). Saving gives it its own policy.</p>}
              {can('hospitals.manage') && <button type="submit" className={`btn btn--primary btn--block${savingPolicy ? ' is-loading' : ''}`} disabled={savingPolicy}><Icon name="check" /><span>Save policy</span></button>}
            </form>
          )}
        </article>

        <article className="card">
          <div className="card__head"><h2 className="card__title"><Icon name="wallet" />Booking payment</h2></div>
          <dl className="kv">
            <div><dt>Booking token (paid in the app)</dt><dd>₹{hospital.bookingFee}</dd></div>
            <div><dt>Consultation fee</dt><dd>Paid at the hospital</dd></div>
          </dl>
          <p className="note" style={{ marginBottom: 0 }}><Icon name="info" /><span>Every hospital uses the same booking token. Gmedic keeps it and it is never refunded; patients pay the doctor&apos;s fee at the hospital. The token amount is set in <Link href="/admin/settings">Platform Settings</Link>.</span></p>
        </article>
      </div>
      <DecisionModal decision={decision} onClose={() => setDecision(null)} />
      <HospitalStatusModal target={statusTarget} onClose={() => setStatusTarget(null)} onDone={() => load()} />
      {editBranch && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="branch-edit-title">
          <div className="modal__backdrop" onClick={() => setEditBranch(null)}></div>
          <div className="modal__panel modal__panel--sm">
            <form onSubmit={saveBranchEdit} noValidate>
              <div className="modal__head">
                <div className="modal__icon tone-teal"><Icon name="building" /></div>
                <div><h2 id="branch-edit-title">Edit branch</h2><p>{hospital.name} · <span className="mono">{editBranch.id}</span></p></div>
              </div>
              <div className="modal__body">
                {[['name', 'Branch name *'], ['address', 'Address *'], ['phone', 'Phone *'], ['contactPerson', 'Contact person (optional)']].map(([k, label]) => (
                  <div key={k} className={`field${branchErrors[k] ? ' has-error' : ''}`} style={{ marginBottom: 12 }}>
                    <label>{label}</label>
                    <input className="input" value={editBranch[k] || ''} onChange={(e) => setEditBranch((b) => ({ ...b, [k]: e.target.value }))} />
                    {branchErrors[k] && <p className="field__error">{branchErrors[k]}</p>}
                  </div>
                ))}
              </div>
              <div className="modal__foot">
                <button type="button" className="btn btn--ghost" onClick={() => setEditBranch(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary"><Icon name="check" />Save Branch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
