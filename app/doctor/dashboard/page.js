import Icon from '../../../components/Icon';
import AvailabilityToggle from '../../../components/doctor/AvailabilityToggle';
import { requireDoctor } from '../../../lib/rbac';
import doctorModel from '../../../models/doctorModel';
import appointmentModel from '../../../models/appointmentModel';
import dates from '../../../utils/dates';

export const metadata = { title: 'Doctor Dashboard · Gmedic' };
export const dynamic = 'force-dynamic';

export default async function DoctorDashboardPage() {
  const user = await requireDoctor();
  if (!user.doctorId) {
    return (
      <div className="alert alert--error"><Icon name="alert" /><span>This account isn&apos;t linked to a doctor record yet. Contact your hospital&apos;s receptionist or Gmedic admin.</span></div>
    );
  }

  const doctor = await doctorModel.findById(user.hospitalId, user.doctorId);
  const today = dates.todayISO();
  const all = await appointmentModel.query(user.hospitalId, { doctorId: user.doctorId });
  const todays = appointmentModel.sortRows(all.filter((a) => a.date === today), 'date_asc');
  const upcoming = all.filter((a) => a.date > today && a.status !== 'cancelled').length;
  const completed = all.filter((a) => a.status === 'completed').length;

  const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const time = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {doctor.name}</h1>
          <p>Here&apos;s your schedule for today.</p>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 24 }}>
        <article className="card">
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
          <div className="kpis">
            <div className="kpi"><span>Today</span><strong>{todays.length}</strong></div>
            <div className="kpi"><span>Upcoming</span><strong>{upcoming}</strong></div>
            <div className="kpi"><span>Completed</span><strong>{completed}</strong></div>
          </div>
        </article>
      </div>

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
                  <td data-label="Time" className="mono">{time(a.time)}</td>
                  <td data-label="Fee" className="num fee">{money(a.fee)}</td>
                  <td data-label="Payment"><span className={`badge badge--${a.paymentStatus}`}>{a.paymentStatus}</span></td>
                  <td data-label="Status"><span className={`badge badge--${a.status}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
