import Link from 'next/link';
import Icon from '../../../components/Icon';
import AvailabilityToggle from '../../../components/doctor/AvailabilityToggle';
import { requireDoctor } from '../../../lib/rbac';
import doctorModel from '../../../models/doctorModel';
import appointmentModel from '../../../models/appointmentModel';
import tokenModel from '../../../models/tokenModel';
import dates from '../../../utils/dates';

export const metadata = { title: 'Doctor Dashboard · Gmedic' };
export const dynamic = 'force-dynamic';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

export default async function DoctorDashboardPage() {
  const user = await requireDoctor();
  if (!user.doctorId) {
    return (
      <div className="alert alert--error"><Icon name="alert" /><span>This account isn&apos;t linked to a doctor record yet. Contact your hospital&apos;s receptionist or Gmedic admin.</span></div>
    );
  }

  const doctor = await doctorModel.findById(user.hospitalId, user.doctorId);
  const today = dates.todayISO();
  const [all, tokens] = await Promise.all([
    appointmentModel.query(user.hospitalId, { doctorId: user.doctorId }),
    tokenModel.query(user.hospitalId, { date: today, doctorId: user.doctorId }),
  ]);
  const todays = appointmentModel.sortRows(all.filter((a) => a.date === today), 'date_asc');
  const upcoming = all.filter((a) => a.date > today && a.status !== 'cancelled').length;
  const completedToday = todays.filter((a) => a.status === 'completed').length;
  const cancelledToday = todays.filter((a) => a.status === 'cancelled').length;
  const waiting = tokens.filter((t) => t.status === 'waiting').length;
  const earningsToday = todays.filter((a) => a.paymentStatus === 'paid').reduce((sum, a) => sum + a.fee, 0);
  const current = tokens.find((t) => t.status === 'in_consultation' || t.status === 'called');
  const nextWaiting = tokens.filter((t) => t.status === 'waiting').sort((a, b) => a.number - b.number).slice(0, 3);

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
          <span className="avatar avatar--teal avatar--xl">{doctor.name.replace(/^Dr\.?\s+/i, '').split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('')}</span>
          <div className="profile-hero__main">
            <h2>{doctor.name}</h2>
            <div className="profile-hero__meta">
              <span>{doctor.specialization}</span><span className="sep"></span>
              <span>{doctor.id}</span><span className="sep"></span>
              <span>{money(doctor.fee)} per visit</span>
            </div>
          </div>
          <AvailabilityToggle initial={doctor.availability} />
        </div>
      </article>

      <section className="summary-strip">
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="calendar" /></span><div><div className="mini-stat__label">Today&apos;s Appointments</div><div className="mini-stat__value">{todays.length}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="hourglass" /></span><div><div className="mini-stat__label">Waiting Patients</div><div className="mini-stat__value">{waiting}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Completed Today</div><div className="mini-stat__value">{completedToday}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-red"><Icon name="calendar-x" /></span><div><div className="mini-stat__label">Cancelled</div><div className="mini-stat__value">{cancelledToday}</div></div></div>
      </section>
      <section className="summary-strip summary-strip--3" style={{ marginTop: -4 }}>
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="rupee" /></span><div><div className="mini-stat__label">Today&apos;s Earnings</div><div className="mini-stat__value">{money(earningsToday)}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-violet"><Icon name="clock" /></span><div><div className="mini-stat__label">Upcoming (all dates)</div><div className="mini-stat__value">{upcoming}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="activity" /></span><div><div className="mini-stat__label">Queue Status</div><div className="mini-stat__value">{current ? current.code : '—'}</div></div></div>
      </section>

      <div className="two-col" style={{ marginBottom: 24 }}>
        <article className="card card--flush">
          <div className="card__head">
            <h2 className="card__title"><Icon name="calendar" />Today&apos;s Appointments</h2>
            <span className="badge badge--teal badge--plain">{todays.length}</span>
          </div>
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table table--compact table--stack">
              <thead><tr><th>Patient</th><th>Time</th><th>Fee</th><th>Payment</th><th>Status</th></tr></thead>
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
            <div className="card__head"><h2 className="card__title"><Icon name="activity" />Today&apos;s Queue</h2></div>
            {current ? (
              <>
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div className="text-muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Current Token</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--teal-600)' }}>{current.code}</div>
                  <div style={{ fontWeight: 700 }}>{current.patientName}</div>
                </div>
              </>
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
            <div className="qa-list">
              <Link href="/doctor/appointments" className="qa"><Icon name="calendar" />View Appointments</Link>
              <Link href="/doctor/schedule" className="qa"><Icon name="clock" />Manage Schedule</Link>
              <Link href="/doctor/availability" className="qa"><Icon name="toggle-left" />Set Availability</Link>
              <Link href="/doctor/patients" className="qa"><Icon name="users" />View Patients</Link>
              <Link href="/doctor/profile" className="qa"><Icon name="pencil" />Edit Profile</Link>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
