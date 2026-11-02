'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon';
import DoctorAvatar from '../DoctorAvatar';
import { formatDate } from '../../lib/format';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

async function get(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=DOCTOR'; throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export default function DashboardView() {
  const [dash, setDash] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    get('/api/doctor/dashboard').then(setDash).catch((e) => setError(e.message));
    get('/api/doctor/analytics').then(setStats).catch(() => {});

    // Keep the live widgets fresh from the per-widget endpoints.
    const refresh = () => {
      get('/api/doctor/dashboard/stats').then(({ date, ...st }) => setDash((d) => d && { ...d, stats: st })).catch(() => {});
      get('/api/doctor/dashboard/queue').then((q) => setDash((d) => d && { ...d, currentToken: q.currentToken, nextWaiting: q.nextWaiting })).catch(() => {});
      get('/api/doctor/dashboard/appointments').then((a) => setDash((d) => d && { ...d, todaysAppointments: a.items })).catch(() => {});
    };
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <div className="alert alert--error"><Icon name="alert" /><span>{error}</span></div>;
  if (!dash) return <div className="skeleton" style={{ height: 400 }}></div>;

  const { doctor, stats: s, currentToken: current, nextWaiting, todaysAppointments: todays } = dash;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good {greeting}, {doctor.name}</h1>
          <p>Here&apos;s your schedule and appointment overview for {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
        </div>
      </div>

      <article className="card" style={{ marginBottom: 24 }}>
        <div className="profile-hero">
          <DoctorAvatar name={doctor.name} photoUrl={doctor.photoUrl} size="xl" />
          <div className="profile-hero__main">
            <h2>{doctor.name}</h2>
            <div className="profile-hero__meta">
              <span>{doctor.specialization}</span><span className="sep"></span>
              <span>{doctor.id}</span><span className="sep"></span>
              <span>{money(doctor.fee)} per visit</span>
            </div>
          </div>
        </div>
      </article>

      <section className="summary-strip">
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="calendar" /></span><div><div className="mini-stat__label">Today&apos;s Appointments</div><div className="mini-stat__value">{s.todaysAppointments}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="hourglass" /></span><div><div className="mini-stat__label">Waiting Patients</div><div className="mini-stat__value">{s.waitingPatients}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Completed Today</div><div className="mini-stat__value">{s.completedToday}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-red"><Icon name="calendar-x" /></span><div><div className="mini-stat__label">Cancelled</div><div className="mini-stat__value">{s.cancelledToday}</div></div></div>
      </section>
      <section className="summary-strip summary-strip--3" style={{ marginTop: -4 }}>
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="rupee" /></span><div><div className="mini-stat__label">Today&apos;s Earnings</div><div className="mini-stat__value">{money(s.earningsToday)}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-violet"><Icon name="clock" /></span><div><div className="mini-stat__label">Upcoming (all dates)</div><div className="mini-stat__value">{s.upcoming}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="activity" /></span><div><div className="mini-stat__label">Queue Status</div><div className="mini-stat__value">{current ? current.code : '—'}</div></div></div>
      </section>

      <div className="two-col" style={{ marginBottom: 24 }}>
        <article className="card card--flush">
          <div className="card__head">
            <div><h2 className="card__title"><Icon name="calendar" />Today&apos;s Appointments</h2><p className="card__subtitle">Today · your bookings</p></div>
            <span className="badge badge--teal badge--plain">{todays.length}</span>
          </div>
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table table--compact table--stack">
              <thead><tr><th>Patient</th><th>Time</th><th className="num">Fee</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody>
                {todays.length === 0 && (
                  <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="calendar" /></div><h3>No appointments today</h3><p>Enjoy the quiet — new bookings from the Gmedic app will show up here.</p></div></td></tr>
                )}
                {todays.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Patient" className="cell-primary">{a.patientName}</td>
                    <td data-label="Time" className="mono">{time12(a.time)}</td>
                    <td data-label="Fee" className="num fee">{money(a.fee)}</td>
                    <td data-label="Payment"><span className={`badge badge--${a.paymentStatus}`}>{a.paymentStatus}</span></td>
                    <td data-label="Status"><span className={`badge badge--${a.status}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <div className="dash-stack">
          <article className="card">
            <div className="card__head"><div><h2 className="card__title"><Icon name="activity" />Today&apos;s Queue</h2><p className="card__subtitle">Today · current token and next in line</p></div></div>
            {current ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div className="text-muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Current Token</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--teal-600)' }}>{current.code}</div>
                <div style={{ fontWeight: 700 }}>{current.patientName}</div>
              </div>
            ) : (
              <p className="text-muted" style={{ textAlign: 'center', padding: '10px 0' }}>No patient in consultation.</p>
            )}
            {nextWaiting.length > 0 && (
              <>
                <div className="text-muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginTop: 10 }}>Next</div>
                <div className="action-group" style={{ marginTop: 6 }}>
                  {nextWaiting.map((t) => <span key={t.id} className="chip">{t.code}</span>)}
                </div>
              </>
            )}
            <Link href="/doctor/queue" className="btn btn--primary btn--block" style={{ marginTop: 16 }}><Icon name="activity" /><span>Manage Queue</span></Link>
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="zap" />Quick Actions</h2></div>
            <div className="qa-list" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              <Link href="/doctor/appointments" className="qa"><Icon name="calendar" />View Appointments</Link>
              <Link href="/doctor/schedule" className="qa"><Icon name="clock" />Manage Schedule</Link>
              <Link href="/doctor/availability" className="qa"><Icon name="toggle-left" />Set Availability</Link>
              <Link href="/doctor/patients" className="qa"><Icon name="users" />View Patients</Link>
              <Link href="/doctor/profile" className="qa"><Icon name="pencil" />Edit Profile</Link>
            </div>
          </article>
        </div>
      </div>

      {stats && (
        <article className="card card--flush">
          <div className="card__head">
            <div><h2 className="card__title"><Icon name="activity" />Activity</h2><p className="card__subtitle">Last 14 days · appointments, patients and earnings</p></div>
            <span className="text-muted">{stats.totals.appointments} appointments · {stats.totals.uniquePatients} patients · {money(stats.totals.earnings)}</span>
          </div>
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table table--compact table--stack">
              <thead><tr><th>Date</th><th className="num">Booked</th><th className="num">Completed</th><th className="num">Cancelled</th><th className="num">Earnings</th></tr></thead>
              <tbody>
                {stats.byDay.length === 0 && <tr><td colSpan={5} className="text-muted">No appointments in this period.</td></tr>}
                {stats.byDay.map((d) => (
                  <tr key={d.date}>
                    <td data-label="Date" className="nowrap">{formatDate(d.date)}</td>
                    <td data-label="Booked" className="num">{d.booked}</td>
                    <td data-label="Completed" className="num">{d.completed}</td>
                    <td data-label="Cancelled" className="num">{d.cancelled}</td>
                    <td data-label="Earnings" className="num fee">{money(d.earnings)}</td>
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
