'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import Icon from '../../../../components/Icon';

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
const DOC_TYPES = { LICENCE: 'Hospital Licence', BANK_PROOF: 'Bank Proof', GST_CERTIFICATE: 'GST Certificate', REGISTRATION: 'Registration' };

export default function HospitalDetailPage({ params }) {
  const { id } = use(params);
  const [hospital, setHospital] = useState(null);
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feeForm, setFeeForm] = useState(null);
  const [savingFees, setSavingFees] = useState(false);
  const [kycReason, setKycReason] = useState('');
  const [savingKyc, setSavingKyc] = useState(false);
  const [kycForm, setKycForm] = useState({ gstin: '', registrationNumber: '' });
  const [kycErrors, setKycErrors] = useState({});
  const [savingKycDetails, setSavingKycDetails] = useState(false);
  const [upload, setUpload] = useState({ docType: 'LICENCE', file: null });
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', contactPerson: '' });
  const [savingBranch, setSavingBranch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, docs, br] = await Promise.all([
        api(`/api/admin/hospitals/${id}`),
        api(`/api/admin/hospitals/${id}/documents`).catch(() => ({ documents: [] })),
        api(`/api/admin/hospitals/${id}/branches`).catch(() => ({ branches: [] })),
      ]);
      setHospital(detail.hospital);
      setStats(detail.stats);
      setDocuments(docs.documents || []);
      setBranches(br.branches || []);
      setKycForm({ gstin: detail.hospital.gstin || '', registrationNumber: detail.hospital.registrationNumber || '' });
      setFeeForm({ bookingModel: detail.hospital.bookingModel, bookingFee: detail.hospital.bookingFee, convenienceFee: detail.hospital.convenienceFee, commissionType: detail.hospital.commissionType, commissionValue: detail.hospital.commissionValue });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveFees(e) {
    e.preventDefault();
    setSavingFees(true);
    try {
      const res = await api(`/api/admin/hospitals/${id}/fees`, { method: 'PUT', body: feeForm });
      toast(res.message, 'success');
      setHospital(res.hospital);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingFees(false);
    }
  }

  async function saveKyc(status) {
    if ((status === 'REJECTED') && !kycReason.trim()) return toast('Enter a reason for rejecting KYC.', 'error');
    setSavingKyc(true);
    try {
      const res = await api(`/api/admin/hospitals/${id}/kyc`, { method: 'PATCH', body: { status, reason: kycReason } });
      toast(res.message, 'success');
      setHospital(res.hospital);
      setKycReason('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingKyc(false);
    }
  }

  async function saveKycDetails(e) {
    e.preventDefault();
    setSavingKycDetails(true);
    setKycErrors({});
    try {
      const res = await api(`/api/admin/hospitals/${id}`, { method: 'PUT', body: { gstin: kycForm.gstin.trim().toUpperCase(), registrationNumber: kycForm.registrationNumber.trim() } });
      toast('KYC details saved.', 'success');
      setHospital(res.hospital);
    } catch (err) {
      setKycErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSavingKycDetails(false);
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

  async function reviewDocument(docId, status) {
    const reason = status === 'REJECTED' ? window.prompt('Reason for rejecting this document:') : null;
    if (status === 'REJECTED' && !reason) return;
    try {
      const res = await api(`/api/admin/hospitals/${id}/documents/${docId}`, { method: 'PATCH', body: { status, reason } });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
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
          <p>Hospital ID: <span className="mono">{hospital.id}</span></p>
        </div>
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
            <div className="card__head"><h2 className="card__title"><Icon name="hospital" />Hospital Information</h2></div>
            <dl className="kv">
              <div><dt>Status</dt><dd>{hospital.status}{hospital.statusReason ? ` — ${hospital.statusReason}` : ''}</dd></div>
              <div><dt>Phone</dt><dd>{hospital.phone}</dd></div>
              <div><dt>Email</dt><dd>{hospital.email}</dd></div>
              <div><dt>Contact person</dt><dd>{hospital.contactPerson || '—'}</dd></div>
              <div className="kv--full"><dt>Address</dt><dd>{[hospital.address.line1, hospital.address.city, hospital.address.state, hospital.address.pincode].filter(Boolean).join(', ')}</dd></div>
            </dl>
          </article>

          <article className="card">
            <div className="card__head"><div><h2 className="card__title"><Icon name="clipboard-list" />KYC &amp; Documents</h2><p className="card__subtitle">Verification · legal details, documents and decision</p></div><span className={`badge badge--${hospital.kycStatus === 'VERIFIED' ? 'confirmed' : hospital.kycStatus === 'REJECTED' ? 'cancelled' : 'pending'}`}>{hospital.kycStatus.replace('_', ' ')}</span></div>
            <form className="kyc-section" onSubmit={saveKycDetails}>
              <h3 className="kyc-section__title">KYC details</h3>
              <div className="form-grid">
                <div className={`field${kycErrors.gstin ? ' has-error' : ''}`}>
                  <label>GSTIN</label>
                  <input className="input mono" value={kycForm.gstin} maxLength={15} placeholder="e.g. 29ABCDE1234F1Z5" onChange={(e) => setKycForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
                  {kycErrors.gstin && <p className="field__error">{kycErrors.gstin}</p>}
                </div>
                <div className={`field${kycErrors.registrationNumber ? ' has-error' : ''}`}>
                  <label>Registration number</label>
                  <input className="input" value={kycForm.registrationNumber} maxLength={40} placeholder="Hospital registration no." onChange={(e) => setKycForm((f) => ({ ...f, registrationNumber: e.target.value }))} />
                  {kycErrors.registrationNumber && <p className="field__error">{kycErrors.registrationNumber}</p>}
                </div>
              </div>
              <div className="kyc-section__actions">
                <button type="submit" className={`btn btn--ghost btn--sm${savingKycDetails ? ' is-loading' : ''}`} disabled={savingKycDetails}><Icon name="check" />Save details</button>
              </div>
            </form>

            <form className="kyc-section" onSubmit={uploadDocument}>
              <h3 className="kyc-section__title">Documents</h3>
              <div className="kyc-upload">
                <select className="select" aria-label="Document type" value={upload.docType} onChange={(e) => setUpload((u) => ({ ...u, docType: e.target.value }))}>
                  {Object.entries(DOC_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <input key={fileInputKey} className="input" type="file" aria-label="Document file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files[0] || null }))} />
                <button type="submit" className={`btn btn--primary btn--sm${uploading ? ' is-loading' : ''}`} disabled={uploading || !upload.file}><Icon name="upload" />Upload</button>
              </div>
              <p className="kyc-section__hint">PDF, PNG or JPEG, up to 8 MB. Uploading moves KYC from Pending to Under review.</p>
            </form>

            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Document</th><th>File</th><th>Status</th><th className="col-actions">Review</th></tr></thead>
                <tbody>
                  {documents.length === 0 && <tr><td colSpan={4} style={{ whiteSpace: 'normal' }}><p className="text-muted">No documents uploaded yet.</p></td></tr>}
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td data-label="Document">{DOC_TYPES[d.docType] || d.docType}</td>
                      <td data-label="File" className="text-muted">{d.fileName}</td>
                      <td data-label="Status"><span className={`badge badge--${d.status === 'VERIFIED' ? 'confirmed' : d.status === 'REJECTED' ? 'cancelled' : 'pending'}`}>{d.status}</span></td>
                      <td className="col-actions">
                        {d.status === 'PENDING' && (
                          <div className="action-group">
                            <button type="button" className="action-btn" onClick={() => reviewDocument(d.id, 'VERIFIED')}><Icon name="check" />Verify</button>
                            <button type="button" className="action-btn" onClick={() => reviewDocument(d.id, 'REJECTED')}><Icon name="x" />Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="kyc-section__title">KYC decision</h3>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>KYC decision reason (for reject)</label>
              <input className="input" value={kycReason} onChange={(e) => setKycReason(e.target.value)} placeholder="Reason if rejecting" />
            </div>
            <div className="action-group">
              {KYC_OPTIONS.map((s) => (
                <button key={s} type="button" className={`btn btn--sm ${s === hospital.kycStatus ? 'btn--primary' : 'btn--ghost'}`} disabled={savingKyc} onClick={() => saveKyc(s)}>{s.replace('_', ' ')}</button>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="building" />Branches</h2></div>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Branch</th><th>Address</th><th>Phone</th><th>Status</th></tr></thead>
                <tbody>
                  {branches.length === 0 && <tr><td colSpan={4} style={{ whiteSpace: 'normal' }}><p className="text-muted">No branches yet — this hospital operates from its main address.</p></td></tr>}
                  {branches.map((b) => (
                    <tr key={b.id}><td data-label="Branch">{b.name}</td><td data-label="Address" className="text-muted">{b.address}</td><td data-label="Phone">{b.phone}</td><td data-label="Status"><span className={`badge badge--${b.status === 'ACTIVE' ? 'confirmed' : 'neutral'}`}>{b.status}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={addBranch} className="form-grid">
              <div className="field"><label>Branch name</label><input className="input" required value={branchForm.name} onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="field"><label>Phone</label><input className="input" required value={branchForm.phone} onChange={(e) => setBranchForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div className="field field--full"><label>Address</label><input className="input" required value={branchForm.address} onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))} /></div>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className={`btn btn--primary${savingBranch ? ' is-loading' : ''}`} disabled={savingBranch}><Icon name="plus" />Add Branch</button>
              </div>
            </form>
          </article>
        </div>

        <article className="card">
          <div className="card__head"><h2 className="card__title"><Icon name="wallet" />Fee &amp; Commission</h2></div>
          {feeForm && (
            <form onSubmit={saveFees}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Booking model</label>
                <select className="select" value={feeForm.bookingModel} onChange={(e) => setFeeForm((f) => ({ ...f, bookingModel: e.target.value }))}>
                  <option value="FULL_PREPAY">Full Pre-pay</option>
                  <option value="BOOKING_FEE">Booking Fee</option>
                  <option value="TOKEN">Token</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Booking fee (₹)</label>
                <input className="input" type="number" min="0" value={feeForm.bookingFee} onChange={(e) => setFeeForm((f) => ({ ...f, bookingFee: e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Convenience fee (₹)</label>
                <input className="input" type="number" min="0" value={feeForm.convenienceFee} onChange={(e) => setFeeForm((f) => ({ ...f, convenienceFee: e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Commission type</label>
                <select className="select" value={feeForm.commissionType} onChange={(e) => setFeeForm((f) => ({ ...f, commissionType: e.target.value }))}>
                  <option value="PERCENT">Percent</option>
                  <option value="FLAT">Flat</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 18 }}>
                <label>Commission value</label>
                <input className="input" type="number" min="0" value={feeForm.commissionValue} onChange={(e) => setFeeForm((f) => ({ ...f, commissionValue: e.target.value }))} />
              </div>
              <button type="submit" className={`btn btn--primary btn--block${savingFees ? ' is-loading' : ''}`} disabled={savingFees}><Icon name="check" /><span>Save</span></button>
            </form>
          )}
        </article>
      </div>
    </>
  );
}
