'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '../../../../components/Icon';
import { formatDate } from '../../../../lib/format';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=DOCTOR'; throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const STATUS_TONE = { confirmed: 'confirmed', pending: 'pending', completed: 'completed', cancelled: 'cancelled' };
const GENDER = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };
const ageGender = (p) => [p.age != null ? `${p.age} yrs` : null, GENDER[p.gender] || null].filter(Boolean).join(' / ') || '—';

export default function PatientDetailPage({ params }) {
  const { id } = use(params);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const router = useRouter();

  useEffect(() => {
    api(`/api/doctor/patients/${id}`).then(setData).catch((err) => toast(err.message, 'error')).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="skeleton" style={{ height: 300 }}></div>;
  if (!data) return <div className="alert alert--error"><Icon name="alert" /><span>Patient not found, or you have no appointments with them.</span></div>;

  const { patient, appointments } = data;
  const completed = appointments.filter((a) => a.status === 'completed');
  const paid = appointments.filter((a) => a.paymentStatus === 'paid');

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb"><Link href="/doctor/patients">Patients</Link><Icon name="chevron-right" /><span>{patient.name}</span></nav>
          <h1>{patient.name}</h1>
          <p>Patient ID: <span className="mono">{patient.id}</span></p>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="kpi"><span>Age / Gender</span><strong>{ageGender(patient)}</strong></div>
        <div className="kpi"><span>Mobile</span><strong className="mono">{patient.mobile}</strong></div>
        <div className="kpi"><span>Total Visits</span><strong>{appointments.length}</strong></div>
        <div className="kpi"><span>Completed</span><strong>{completed.length}</strong></div>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab${tab === 'overview' ? ' is-active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button type="button" className={`tab${tab === 'appointments' ? ' is-active' : ''}`} onClick={() => setTab('appointments')}>Appointments</button>
        <button type="button" className={`tab${tab === 'payments' ? ' is-active' : ''}`} onClick={() => setTab('payments')}>Payments</button>
      </div>

      {tab === 'overview' && (
        <article className="card">
          <div className="card__head"><h2 className="card__title"><Icon name="user" />Basic Information</h2></div>
          <dl className="kv">
            <div><dt>Name</dt><dd>{patient.name}</dd></div>
            <div><dt>Mobile</dt><dd className="mono">{patient.mobile}</dd></div>
            <div><dt>Email</dt><dd>{patient.email || '—'}</dd></div>
            <div><dt>Patient ID</dt><dd className="mono">{patient.id}</dd></div>
            <div><dt>Gender</dt><dd>{GENDER[patient.gender] || '—'}</dd></div>
            <div><dt>Date of birth</dt><dd>{patient.dateOfBirth ? `${formatDate(patient.dateOfBirth)}${patient.age != null ? ` (${patient.age} yrs)` : ''}` : '—'}</dd></div>
          </dl>
        </article>
      )}

      {(tab === 'appointments' || tab === 'overview') && tab !== 'payments' && (
        <article className="card card--flush" style={{ marginTop: tab === 'overview' ? 20 : 0 }}>
          <div className="card__head"><h2 className="card__title"><Icon name="calendar" />Appointment History</h2></div>
          <div className="table-wrap">
            <table className="table table--compact table--stack">
              <thead><tr><th>Appointment ID</th><th>Date</th><th>Time</th><th className="num">Fee</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="is-clickable" tabIndex={0} onClick={() => router.push(`/doctor/appointments?open=${a.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/doctor/appointments?open=${a.id}`); }}>
                    <td data-label="Appointment ID" className="mono">{a.id}</td>
                    <td data-label="Date" className="nowrap">{formatDate(a.date)}</td>
                    <td data-label="Time" className="mono">{a.time}</td>
                    <td data-label="Fee" className="num fee">{money(a.fee)}</td>
                    <td data-label="Payment"><span className={`badge badge--${a.paymentStatus === 'paid' ? 'confirmed' : 'pending'}`}>{a.paymentStatus}</span></td>
                    <td data-label="Status"><span className={`badge badge--${STATUS_TONE[a.status]}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {tab === 'payments' && (
        <article className="card card--flush">
          <div className="card__head"><h2 className="card__title"><Icon name="credit-card" />Payments</h2></div>
          <div className="table-wrap">
            <table className="table table--compact table--stack">
              <thead><tr><th>Appointment ID</th><th>Date</th><th className="num">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {paid.length === 0 && <tr><td colSpan={4} style={{ whiteSpace: 'normal' }}><p className="text-muted" style={{ padding: 16 }}>No paid appointments yet.</p></td></tr>}
                {paid.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Appointment ID" className="mono">{a.id}</td>
                    <td data-label="Date" className="nowrap">{formatDate(a.date)}</td>
                    <td data-label="Amount" className="num fee">{money(a.fee)}</td>
                    <td data-label="Status"><span className="badge badge--confirmed">Paid</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </>
  );
}
