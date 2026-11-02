'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';
import Pager from '../../../components/admin/Pager';
import usePermissions from '../../../components/admin/usePermissions';
import { formatDate, formatDateTime, formatTime, maskMobile } from '../../../lib/format';

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

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// One field per search method; each maps to a backend parameter of
// /api/admin/patients/search (controllers/admin/patientsController.js).
const SEARCH_MODES = {
  name: { label: 'Patient name', param: 'q', icon: 'search', placeholder: 'e.g. Aman Choudhary', minLength: 2, normalize: (v) => v.trim() },
  // Stored as 10 digits: accept "+91 98454 00317", "098454-00317", etc.
  mobile: { label: 'Mobile number', param: 'mobile', icon: 'phone', placeholder: '10-digit mobile number', normalize: (v) => v.replace(/\D/g, '').slice(-10) },
  patientId: { label: 'Patient ID', param: 'patientId', icon: 'hash', placeholder: 'e.g. PAT1003', normalize: (v) => v.trim().toUpperCase() },
  appointmentId: { label: 'Appointment ID', param: 'appointmentId', icon: 'calendar', placeholder: 'e.g. APT10528', normalize: (v) => v.trim().toUpperCase() },
};

// Blocking acts on the patient's Gmedic app account (the person and their family profiles).
function BlockModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // A fresh form for every patient: nothing typed for the last one carries over.
  useEffect(() => { setReason(''); setError(''); setSaving(false); }, [target && target.id]);
  if (!target) return null;
  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api(`/api/admin/patients/${target.id}/block`, { method: 'POST', body: { reason } });
      toast(res.message, 'success'); setReason(''); onDone(); onClose();
    } catch (err) { setError((err.fields && err.fields.reason) || err.message); } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="block-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="ban" /></div>
            <div><h2 id="block-title">Block {target.name}&apos;s app account?</h2><p>They are signed out of the Gmedic app at once and can&apos;t sign in again until you unblock them. Their upcoming appointments stay as they are.</p></div>
          </div>
          <div className="modal__body">
            <div className={`field${error ? ' has-error' : ''}`}>
              <label>Reason *</label>
              <textarea className="textarea" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter the reason for blocking this account…" required />
              {error && <p className="field__error">{error}</p>}
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--danger${saving ? ' is-loading' : ''}`} disabled={saving}>Block Account</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UnblockModal({ target, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/patients/${target.id}/unblock`, { method: 'POST' });
      toast(res.message, 'success'); onDone(); onClose();
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="unblock-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-green"><Icon name="user-check" /></div>
            <div><h2 id="unblock-title">Unblock {target.name}?</h2><p>They can sign in to the Gmedic app again. They will need to sign in again; earlier sessions stay ended.</p></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}>Unblock Account</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Erasure never hard-deletes: names, mobile, email and date of birth are removed (the same anonymisation as
// "Delete my account" in the app), while hospitals keep the visit and payment records they need.
function EraseModal({ target, account, onClose, onDone }) {
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setConfirm(''); setSaving(false); }, [target && target.id]);
  if (!target) return null;
  const matches = confirm.trim().toUpperCase() === target.id;
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/patients/${target.id}/erase`, { method: 'POST', body: { confirm } });
      toast(res.message, 'success'); setConfirm(''); onDone(); onClose();
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="erase-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="trash" /></div>
            <div><h2 id="erase-title">Erase {target.name}&apos;s personal data?</h2><p>This can&apos;t be undone. The name, mobile number, email and date of birth are removed from the account and every family profile on it, and the account is closed. Hospitals keep the appointment and payment records, without the patient&apos;s details.</p></div>
          </div>
          <div className="modal__body">
            {account && account.upcomingAppointments > 0 && <div className="alert alert--error" style={{ marginBottom: 14 }}><Icon name="alert-triangle" /><span>{account.upcomingAppointments} upcoming appointment{account.upcomingAppointments === 1 ? '' : 's'} will be cancelled and refunded by the usual rules.</span></div>}
            <div className="field">
              <label>Type <span className="mono">{target.id}</span> to confirm</label>
              <input className="input mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--danger${saving ? ' is-loading' : ''}`} disabled={saving || !matches}>Erase Personal Data</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PatientsPage() {
  const can = usePermissions();
  const [dialog, setDialog] = useState(null); // 'block' | 'unblock' | 'erase'
  const [mode, setMode] = useState('name');
  const [value, setValue] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(null); // { label, value } of the last search, for the empty state
  const [inputError, setInputError] = useState('');
  const [detail, setDetail] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [paging, setPaging] = useState({ total: 0, page: 1, pages: 1 });

  // A name search is paged (10 a time); the other modes find at most one patient.
  async function runSearch(m, term, page = 1) {
    setSearching(true);
    setDetail(null);
    try {
      const data = await api(`/api/admin/patients/search?${new URLSearchParams({ [m.param]: term, page: String(page) })}`);
      setResults(data.items);
      setPaging({ total: data.total ?? data.items.length, page: data.page || 1, pages: data.pages || 1 });
      setSearched({ label: m.label, value: term, mode: m, page });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSearching(false);
    }
  }

  function search(e) {
    e.preventDefault();
    const m = SEARCH_MODES[mode];
    const term = m.normalize(value);
    if (m.minLength && term.length < m.minLength) { setInputError(`Enter at least ${m.minLength} characters.`); return; }
    if (!term) { setInputError(`Enter the ${lowerFirst(m.label)}.`); return; }
    setInputError('');
    runSearch(m, term, 1);
  }

  async function openPatient(id) {
    setLoadingDetail(true);
    try {
      const data = await api(`/api/admin/patients/${id}`);
      setDetail(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Patient Lookup</h1>
          <p>Find a patient by name, mobile number, patient ID or appointment ID.</p>
        </div>
      </div>

      <article className="card">
        <form className="toolbar" onSubmit={search} style={{ marginBottom: 0 }}>
          <div className="field toolbar__item">
            <label htmlFor="patient-search-mode">Search by</label>
            <select id="patient-search-mode" className="select" value={mode} onChange={(e) => { setMode(e.target.value); setValue(''); setInputError(''); setSearched(null); setResults([]); }}>
              {Object.entries(SEARCH_MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div className={`field toolbar__search${inputError ? ' has-error' : ''}`}>
            <label htmlFor="patient-search-value">{SEARCH_MODES[mode].label}</label>
            <div className="input-wrap"><Icon name={SEARCH_MODES[mode].icon} /><input id="patient-search-value" className="input" placeholder={SEARCH_MODES[mode].placeholder} inputMode={mode === 'mobile' ? 'tel' : undefined} value={value} onChange={(e) => setValue(e.target.value)} /></div>
            {inputError && <p className="field__error">{inputError}</p>}
          </div>
          <button type="submit" className={`btn btn--primary${searching ? ' is-loading' : ''}`} disabled={searching}><Icon name="search" /><span>Search</span></button>
        </form>
      </article>

      {searched && results.length === 0 && !detail && (
        <article className="card" style={{ marginTop: 20 }}>
          <div className="empty">
            <div className="empty__icon"><Icon name="search" /></div>
            <h3>No patient found</h3>
            <p>Nothing matches {lowerFirst(searched.label)} “{searched.value}”. Check it, or search by another detail.</p>
          </div>
        </article>
      )}

      {results.length > 0 && !detail && (
        <article className="card card--flush" style={{ marginTop: 20 }}>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead><tr><th>Patient</th><th>Mobile</th><th>Email</th><th>Appointments</th><th className="col-actions">Actions</th></tr></thead>
              <tbody>
                {results.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Patient" className="cell-primary">{p.name}<span className="cell-sub mono">{p.id}</span></td>
                    <td data-label="Mobile" className="mono">{maskMobile(p.mobile)}</td>
                    <td data-label="Email" className="text-muted">{p.email || '—'}</td>
                    <td data-label="Appointments">{p.appointmentCount}</td>
                    <td className="col-actions"><button type="button" className="action-btn" onClick={() => openPatient(p.id)}><Icon name="eye" />View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paging.pages > 1 && <Pager total={paging.total} page={paging.page} pages={paging.pages} noun="patient" onPage={(p) => runSearch(searched.mode, searched.value, p)} />}
        </article>
      )}

      {loadingDetail && <div className="skeleton" style={{ height: 200, marginTop: 20 }}></div>}

      <BlockModal target={dialog === 'block' && detail ? detail.patient : null} onClose={() => setDialog(null)} onDone={() => openPatient(detail.patient.id)} />
      <UnblockModal target={dialog === 'unblock' && detail ? detail.patient : null} onClose={() => setDialog(null)} onDone={() => openPatient(detail.patient.id)} />
      <EraseModal target={dialog === 'erase' && detail ? detail.patient : null} account={detail && detail.account} onClose={() => setDialog(null)} onDone={() => openPatient(detail.patient.id)} />

      {detail && !loadingDetail && (
        <div className="two-col" style={{ marginTop: 20 }}>
          <div className="dash-stack">
            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="user" />{detail.patient.name}</h2><button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>Back to results</button></div>
              {detail.account && detail.account.blocked && (
                <div className="alert alert--error" style={{ marginBottom: 14 }}><Icon name="ban" /><span>App account blocked{detail.account.blockedAt ? ` on ${formatDate(detail.account.blockedAt)}` : ''}{detail.account.blockedBy ? ` by ${detail.account.blockedBy}` : ''}{detail.account.blockedReason ? `: ${detail.account.blockedReason}` : '.'}</span></div>
              )}
              {detail.patient.erased && <div className="alert alert--info" style={{ marginBottom: 14 }}><Icon name="info" /><span>This patient&apos;s personal data has been erased. Only appointment and payment records remain.</span></div>}
              <dl className="kv">
                <div><dt>Patient ID</dt><dd className="mono">{detail.patient.id}</dd></div>
                {/* Full number only in this authorised detail view (patients.view: Super Admin, Support); lists stay masked. */}
                <div><dt>Mobile</dt><dd>{detail.patient.mobile || '—'}</dd></div>
                <div><dt>Email</dt><dd>{detail.patient.email || '—'}</dd></div>
                <div><dt>Registered</dt><dd>{detail.patient.createdAt ? formatDate(detail.patient.createdAt) : '—'}</dd></div>
                {detail.patient.relation && detail.patient.relation !== 'SELF' && <div><dt>Relation</dt><dd>{detail.patient.relation.toLowerCase()} on another person&apos;s account</dd></div>}
              </dl>
            </article>

            <article className="card">
              <div className="card__head">
                <h2 className="card__title"><Icon name="smartphone" />Gmedic app account</h2>
                {detail.account && can('patients.manage') && (
                  <div className="action-group">
                    {detail.account.blocked
                      ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog('unblock')}><Icon name="user-check" />Unblock</button>
                      : <button type="button" className="btn btn--ghost btn--sm" style={{ color: 'var(--red-600)' }} onClick={() => setDialog('block')}><Icon name="ban" />Block</button>}
                    <button type="button" className="btn btn--ghost btn--sm" style={{ color: 'var(--red-600)' }} onClick={() => setDialog('erase')}><Icon name="trash" />Erase data</button>
                  </div>
                )}
              </div>
              {!detail.account && <p className="text-muted">{detail.patient.erased ? 'The account was closed when the data was erased.' : 'No app account. This patient was added at a hospital front desk, so there is nothing to block.'}</p>}
              {detail.account && (
                <dl className="kv">
                  <div><dt>Status</dt><dd><span className={`badge badge--${detail.account.blocked ? 'cancelled' : 'confirmed'}`}>{detail.account.blocked ? 'Blocked' : 'Active'}</span></dd></div>
                  <div><dt>Last sign-in</dt><dd>{detail.account.lastLoginAt ? formatDateTime(detail.account.lastLoginAt) : '—'}</dd></div>
                  <div><dt>Upcoming appointments</dt><dd>{detail.account.upcomingAppointments}</dd></div>
                </dl>
              )}
            </article>

            <article className="card card--flush">
              <div className="card__head"><h2 className="card__title"><Icon name="calendar" />Appointments</h2></div>
              <div className="table-wrap">
                <table className="table table--compact table--stack">
                  <thead><tr><th>Hospital</th><th>Doctor</th><th>Date</th><th className="num">Fee</th><th>Status</th></tr></thead>
                  <tbody>
                    {detail.appointments.length === 0 && <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><p className="text-muted">No appointments yet.</p></td></tr>}
                    {detail.appointments.map((a) => (
                      <tr key={a.id}><td data-label="Hospital">{a.hospitalName}</td><td data-label="Doctor">{a.doctorName}</td><td data-label="Date" className="nowrap">{formatDate(a.date)}, {formatTime(a.time)}<span className="cell-sub mono">{a.id}</span></td><td data-label="Fee" className="num fee">{money(a.fee)}</td><td data-label="Status"><span className={`badge badge--${a.status}`}>{a.status}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>

          <div className="dash-stack">
            {detail.family.length > 0 && (
              <article className="card">
                <div className="card__head"><h2 className="card__title"><Icon name="users" />Family on this account</h2></div>
                {detail.family.map((m) => <div key={m.id} className="kv"><div><dt>{m.name}</dt><dd className="text-muted"><span className="mono">{m.id}</span> · {m.relation.toLowerCase()}</dd></div></div>)}
              </article>
            )}

            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="shield" />Consent</h2></div>
              {detail.consents.length === 0 && <p className="text-muted">No consent records.</p>}
              {detail.consents.map((c, i) => <div key={i} className="kv" style={{ marginBottom: 8 }}><div><dt>{c.purpose.replace(/_/g, ' ').toLowerCase()} · policy {c.policyVersion}</dt><dd>{c.withdrawnAt ? <>Withdrawn {formatDate(c.withdrawnAt)}</> : <>Given {formatDate(c.grantedAt)}</>}</dd></div></div>)}
            </article>

            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="hospital" />Linked Hospitals</h2></div>
              {detail.hospitals.length === 0 && <p className="text-muted">Not linked to any hospital yet.</p>}
              {detail.hospitals.map((h) => <div key={h.id} className="kv"><div><dt>{h.name}</dt><dd className="text-muted">Linked {h.linkedAt ? formatDate(h.linkedAt) : '—'}</dd></div></div>)}
            </article>

            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="credit-card" />Payments</h2></div>
              {detail.payments.length === 0 && <p className="text-muted">No payments yet.</p>}
              {detail.payments.map((p) => (
                <div key={p.id} className="kv" style={{ marginBottom: 8 }}><div><dt>{p.hospitalName}</dt><dd>{money(p.amount)} · <span className={`badge badge--${p.status === 'PAID' ? 'confirmed' : 'pending'}`}>{p.status}</span><span className="cell-sub">{formatDate(p.paidAt || p.createdAt)}</span></dd></div></div>
              ))}
            </article>

            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="refresh" />Refunds</h2></div>
              {detail.refunds.length === 0 && <p className="text-muted">No refunds yet.</p>}
              {detail.refunds.map((r) => (
                <div key={r.id} className="kv" style={{ marginBottom: 8 }}><div><dt>{r.hospitalName}</dt><dd>{money(r.amount)} · <span className={`badge badge--${r.status === 'COMPLETED' ? 'confirmed' : 'pending'}`}>{r.status}</span><span className="cell-sub">{formatDate(r.createdAt)}</span></dd></div></div>
              ))}
            </article>
          </div>
        </div>
      )}
    </>
  );
}
