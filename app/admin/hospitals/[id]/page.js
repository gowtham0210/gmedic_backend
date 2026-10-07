'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import Icon from '../../../../components/Icon';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: !opts.body ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
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
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', contactPerson: '' });
  const [savingBranch, setSavingBranch] = useState(false);
  const [rates, setRates] = useState([]);
  const [editing, setEditing] = useState(false);
  const [infoForm, setInfoForm] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [uploadType, setUploadType] = useState('LICENCE');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, docs, br, rt] = await Promise.all([
        api(`/api/admin/hospitals/${id}`),
        api(`/api/admin/hospitals/${id}/documents`).catch(() => ({ documents: [] })),
        api(`/api/admin/hospitals/${id}/branches`).catch(() => ({ branches: [] })),
        api(`/api/admin/hospitals/${id}/rates`).catch(() => ({ rates: [] })),
      ]);
      setHospital(detail.hospital);
      setStats(detail.stats);
      setDocuments(docs.documents || []);
      setBranches(br.branches || []);
      setRates(rt.rates || []);
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
      load();
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

  function startEdit() {
    setInfoForm({
      contactPerson: hospital.contactPerson || '', phone: hospital.phone, email: hospital.email,
      line1: hospital.address.line1 || '', city: hospital.address.city || '', state: hospital.address.state || '', pincode: hospital.address.pincode || '',
      gstin: hospital.gstin || '', registrationNumber: hospital.registrationNumber || '',
    });
    setEditing(true);
  }

  async function saveInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    try {
      // Blank optional fields are left out, so they stay unchanged instead of being saved as empty text.
      const body = Object.fromEntries(Object.entries(infoForm).filter(([, v]) => String(v).trim() !== ''));
      const res = await api(`/api/admin/hospitals/${id}`, { method: 'PUT', body });
      toast(res.message, 'success');
      setHospital(res.hospital);
      setEditing(false);
    } catch (err) {
      toast(err.fields ? Object.values(err.fields)[0] : err.message, 'error');
    } finally {
      setSavingInfo(false);
    }
  }

  async function uploadDocument(e) {
    e.preventDefault();
    if (!uploadFile) return toast('Choose a PDF, PNG or JPEG file (max 8 MB).', 'error');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('docType', uploadType);
      body.append('file', uploadFile);
      const res = await api(`/api/admin/hospitals/${id}/documents`, { method: 'POST', body });
      toast(res.message, 'success');
      setUploadFile(null);
      e.target.reset();
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function toggleBranch(branch) {
    const status = branch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await api(`/api/admin/branches/${branch.id}`, { method: 'PATCH', body: { status } });
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
            <div className="card__head">
              <h2 className="card__title"><Icon name="hospital" />Hospital Information</h2>
              {!editing && <button type="button" className="btn btn--ghost btn--sm" onClick={startEdit}><Icon name="pencil" />Edit</button>}
            </div>
            {editing && infoForm && (
              <form onSubmit={saveInfo} className="form-grid">
                {[['phone', 'Phone'], ['email', 'Email'], ['contactPerson', 'Contact person'], ['gstin', 'GSTIN'], ['registrationNumber', 'Registration no.'], ['pincode', 'PIN code'], ['city', 'City'], ['state', 'State']].map(([k, label]) => (
                  <div className="field" key={k}><label>{label}</label><input className="input" value={infoForm[k]} onChange={(e) => setInfoForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
                ))}
                <div className="field field--full"><label>Street address</label><input className="input" value={infoForm.line1} onChange={(e) => setInfoForm((f) => ({ ...f, line1: e.target.value }))} /></div>
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
              <div><dt>GSTIN</dt><dd>{hospital.gstin || '—'}</dd></div>
              <div><dt>Registration No.</dt><dd>{hospital.registrationNumber || '—'}</dd></div>
            </dl>}
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="clipboard-list" />KYC &amp; Documents</h2><span className={`badge badge--${hospital.kycStatus === 'VERIFIED' ? 'confirmed' : hospital.kycStatus === 'REJECTED' ? 'cancelled' : 'pending'}`}>{hospital.kycStatus.replace('_', ' ')}</span></div>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Document</th><th>File</th><th>Status</th><th className="col-actions">Review</th></tr></thead>
                <tbody>
                  {documents.length === 0 && <tr><td colSpan={4} style={{ whiteSpace: 'normal' }}><p className="text-muted">No documents uploaded yet.</p></td></tr>}
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td data-label="Document">{DOC_TYPES[d.docType] || d.docType}</td>
                      <td data-label="File" className="text-muted"><a href={`/api/admin/hospitals/${id}/documents/${d.id}`} target="_blank" rel="noreferrer">{d.fileName}</a></td>
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
            <form onSubmit={uploadDocument} className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field"><label>Document type</label>
                <select className="select" value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                  {Object.entries(DOC_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div className="field"><label>File (PDF, PNG or JPEG, max 8 MB)</label><input className="input" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setUploadFile(e.target.files[0] || null)} /></div>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className={`btn btn--ghost btn--sm${uploading ? ' is-loading' : ''}`} disabled={uploading}><Icon name="plus" />Upload document</button>
              </div>
            </form>
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
                <thead><tr><th>Branch</th><th>Address</th><th>Phone</th><th>Status</th><th className="col-actions">Action</th></tr></thead>
                <tbody>
                  {branches.length === 0 && <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><p className="text-muted">No branches yet — this hospital operates from its main address.</p></td></tr>}
                  {branches.map((b) => (
                    <tr key={b.id}><td data-label="Branch">{b.name}</td><td data-label="Address" className="text-muted">{b.address}</td><td data-label="Phone">{b.phone}</td><td data-label="Status"><span className={`badge badge--${b.status === 'ACTIVE' ? 'confirmed' : 'neutral'}`}>{b.status}</span></td><td className="col-actions"><button type="button" className="action-btn" onClick={() => toggleBranch(b)}>{b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></td></tr>
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
          <h3 style={{ margin: '22px 0 8px', fontSize: 14 }}>Rate history</h3>
          <div className="table-wrap">
            <table className="table table--compact">
              <thead><tr><th>Effective</th><th>Model</th><th>Commission</th></tr></thead>
              <tbody>
                {rates.length === 0 && <tr><td colSpan={3}><p className="text-muted">No changes recorded yet.</p></td></tr>}
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td suppressHydrationWarning>{new Date(r.effectiveFrom).toLocaleDateString('en-IN')}</td>
                    <td>{(r.bookingModel || '').replace('_', ' ')}</td>
                    <td>{r.commissionType === 'PERCENT' ? `${r.commissionValue}%` : `₹${r.commissionValue} / appt`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </>
  );
}
