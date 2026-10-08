'use client';

import { useState } from 'react';
import Icon from '../../../components/Icon';
import { formatDate, formatTime } from '../../../lib/format';

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

export default function PatientsPage() {
  const [mode, setMode] = useState('q');
  const [q, setQ] = useState('');
  const [mobile, setMobile] = useState('');
  const [results, setResults] = useState([]);
  const [detail, setDetail] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setDetail(null);
    try {
      const qs = new URLSearchParams();
      if (mode === 'mobile') qs.set('mobile', mobile.trim()); else qs.set('q', q.trim());
      const data = await api(`/api/admin/patients/search?${qs}`);
      setResults(data.items);
      if (data.items.length === 0) toast('No patients matched.', 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSearching(false);
    }
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
            <label>Search by</label>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="q">Name / ID</option>
              <option value="mobile">Mobile number</option>
            </select>
          </div>
          {mode === 'mobile' ? (
            <div className="field toolbar__search">
              <label>Mobile</label>
              <div className="input-wrap"><Icon name="phone" /><input className="input" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
            </div>
          ) : (
            <div className="field toolbar__search">
              <label>Name or patient ID</label>
              <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Search patients" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
          )}
          <button type="submit" className={`btn btn--primary${searching ? ' is-loading' : ''}`} disabled={searching}><Icon name="search" /><span>Search</span></button>
        </form>
      </article>

      {results.length > 0 && !detail && (
        <article className="card card--flush" style={{ marginTop: 20 }}>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead><tr><th>Patient</th><th>Mobile</th><th>Email</th><th>Appointments</th><th className="col-actions">Actions</th></tr></thead>
              <tbody>
                {results.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Patient" className="cell-primary">{p.name}<span className="cell-sub mono">{p.id}</span></td>
                    <td data-label="Mobile" className="mono">{p.mobile}</td>
                    <td data-label="Email" className="text-muted">{p.email || '—'}</td>
                    <td data-label="Appointments">{p.appointmentCount}</td>
                    <td className="col-actions"><button type="button" className="action-btn" onClick={() => openPatient(p.id)}><Icon name="eye" />View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {loadingDetail && <div className="skeleton" style={{ height: 200, marginTop: 20 }}></div>}

      {detail && !loadingDetail && (
        <div className="two-col" style={{ marginTop: 20 }}>
          <div className="dash-stack">
            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="user" />{detail.patient.name}</h2><button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>Back to results</button></div>
              <dl className="kv">
                <div><dt>Patient ID</dt><dd className="mono">{detail.patient.id}</dd></div>
                <div><dt>Mobile</dt><dd>{detail.patient.mobile}</dd></div>
                <div><dt>Email</dt><dd>{detail.patient.email || '—'}</dd></div>
                <div><dt>Registered</dt><dd>{detail.patient.createdAt ? formatDate(detail.patient.createdAt) : '—'}</dd></div>
              </dl>
            </article>

            <article className="card card--flush">
              <div className="card__head"><h2 className="card__title"><Icon name="calendar" />Appointments</h2></div>
              <div className="table-wrap">
                <table className="table table--compact table--stack">
                  <thead><tr><th>Hospital</th><th>Doctor</th><th>Date</th><th className="num">Fee</th><th>Status</th></tr></thead>
                  <tbody>
                    {detail.appointments.length === 0 && <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><p className="text-muted">No appointments yet.</p></td></tr>}
                    {detail.appointments.map((a) => (
                      <tr key={a.id}><td data-label="Hospital">{a.hospitalName}</td><td data-label="Doctor">{a.doctorName}</td><td data-label="Date" className="nowrap">{formatDate(a.date)}, {formatTime(a.time)}</td><td data-label="Fee" className="num fee">{money(a.fee)}</td><td data-label="Status"><span className={`badge badge--${a.status}`}>{a.status}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>

          <div className="dash-stack">
            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="hospital" />Linked Hospitals</h2></div>
              {detail.hospitals.length === 0 && <p className="text-muted">Not linked to any hospital yet.</p>}
              {detail.hospitals.map((h) => <div key={h.id} className="kv"><div><dt>{h.name}</dt><dd className="text-muted">Linked {h.linkedAt ? formatDate(h.linkedAt) : '—'}</dd></div></div>)}
            </article>

            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="credit-card" />Payments</h2></div>
              {detail.payments.length === 0 && <p className="text-muted">No payments yet.</p>}
              {detail.payments.map((p) => (
                <div key={p.id} className="kv" style={{ marginBottom: 8 }}><div><dt>{p.hospitalName}</dt><dd>{money(p.amount)} · <span className={`badge badge--${p.status === 'PAID' ? 'confirmed' : 'pending'}`}>{p.status}</span></dd></div></div>
              ))}
            </article>

            <article className="card">
              <div className="card__head"><h2 className="card__title"><Icon name="refresh" />Refunds</h2></div>
              {detail.refunds.length === 0 && <p className="text-muted">No refunds yet.</p>}
              {detail.refunds.map((r) => (
                <div key={r.id} className="kv" style={{ marginBottom: 8 }}><div><dt>{r.hospitalName}</dt><dd>{money(r.amount)} · <span className={`badge badge--${r.status === 'COMPLETED' ? 'confirmed' : 'pending'}`}>{r.status}</span></dd></div></div>
              ))}
            </article>
          </div>
        </div>
      )}
    </>
  );
}
