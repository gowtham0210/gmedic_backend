import Link from 'next/link';
import Icon from '../../../components/Icon';
import DashboardCharts from '../../../components/admin/DashboardCharts';
import getDashboardData from '../../../lib/admin/getDashboardData';
import { paymentSuccessTone } from '../../../lib/admin/kpiTone';
import { formatDate } from '../../../lib/format';

export const metadata = { title: 'Super Admin Dashboard · Gmedic' };
export const dynamic = 'force-dynamic';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function StatCard({ icon, tone, label, value, href }) {
  const Wrap = href ? Link : 'div';
  return (
    <Wrap className="card stat" href={href}>
      <span className={`stat__icon ${tone}`}><Icon name={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="stat__label">{label}</div>
        <div className="stat__value">{value}</div>
      </div>
    </Wrap>
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "Do I need to do anything?" — answered right under the KPIs. Lists only the
// categories that have something in them; colour comes from the most severe one.
function AttentionBanner({ cards }) {
  const items = [
    { n: cards.suspendedHospitals, text: (n) => `${plural(n, 'hospital', 'hospitals')} suspended`, href: '/admin/hospitals?status=SUSPENDED', severity: 'red' },
    { n: cards.failedPayments, text: (n) => `${plural(n, 'payment', 'payments')} failed`, href: '/admin/payments', severity: 'red' },
    { n: cards.pendingKyc, text: (n) => `${plural(n, 'hospital', 'hospitals')} pending KYC`, href: '/admin/hospitals?kycStatus=PENDING', severity: 'amber' },
    { n: cards.pendingRefunds, text: (n) => `${plural(n, 'refund requires', 'refunds require')} review`, href: '/admin/refunds?status=PENDING', severity: 'amber' },
    { n: cards.pendingDoctorVerification, text: (n) => `${plural(n, 'doctor', 'doctors')} pending verification`, href: '/admin/doctors', severity: 'amber' },
    { n: cards.openSupportTickets, text: (n) => plural(n, 'open support ticket', 'open support tickets'), href: '/admin/support', severity: 'amber' },
  ].filter((i) => i.n > 0);
  const total = items.reduce((t, i) => t + i.n, 0);

  if (!total) {
    return (
      <section className="card attention attention--clear" aria-label="Attention">
        <span className="attention__icon"><Icon name="check-circle" /></span>
        <div>
          <h2 className="attention__title">All clear</h2>
          <p className="attention__sub">Nothing requires your attention right now.</p>
        </div>
      </section>
    );
  }
  const tone = items.some((i) => i.severity === 'red') ? 'red' : 'amber';
  return (
    <section className={`card attention attention--${tone}`} aria-label="Attention">
      <span className="attention__icon"><Icon name="alert-triangle" /></span>
      <div style={{ minWidth: 0 }}>
        <h2 className="attention__title">{plural(total, 'item needs', 'items need')} attention</h2>
        <ul className="attention__list">
          {items.map((i) => (
            <li key={i.text(i.n)}>
              <Link href={i.href} className={`attention__link is-${i.severity}`}>{i.text(i.n)}<Icon name="chevron-right" /></Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function kycBadge(status) {
  const map = { VERIFIED: 'confirmed', PENDING: 'pending', UNDER_REVIEW: 'pending', REJECTED: 'cancelled' };
  return <span className={`badge badge--${map[status] || 'neutral'}`}>{status.replace('_', ' ')}</span>;
}
function statusBadge(status) {
  const map = { ACTIVE: 'confirmed', ONBOARDING: 'pending', SUSPENDED: 'cancelled', OFFBOARDED: 'neutral' };
  return <span className={`badge badge--${map[status] || 'neutral'}`}>{status}</span>;
}

export default async function AdminDashboardPage() {
  let data;
  let dbError = null;
  try {
    data = await getDashboardData();
  } catch (err) {
    dbError = err.message;
  }

  if (dbError) {
    return (
      <div className="alert alert--error" style={{ margin: '20px 0' }}>
        <Icon name="alert" />
        <span>Could not load dashboard data — the database isn&apos;t reachable yet ({dbError}). Run <code>database/setup.sql</code>, then <code>npm run db:setup</code>.</span>
      </div>
    );
  }

  const { cards, bookingTrend, revenueTrend, recentHospitals, recentAppointments } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Platform Dashboard</h1>
          <p>A live, platform-wide view across every hospital on Gmedic.</p>
        </div>
      </div>

      {/* Primary KPIs: two prioritised groups of three; exceptions live in the strip below. */}
      <section className="kpi-group" aria-labelledby="kpi-health">
        <h2 className="kpi-group__title" id="kpi-health">Platform health</h2>
        <div className="stats stats--3">
          <StatCard icon="hospital" tone="tone-neutral" label="Total Hospitals" value={cards.totalHospitals} href="/admin/hospitals" />
          <StatCard icon="check-circle" tone="tone-green" label="Active Hospitals" value={cards.activeHospitals} href="/admin/hospitals?status=ACTIVE" />
          <StatCard icon="trending-up" tone={paymentSuccessTone(cards.paymentSuccessRate)} label="Payment Success" value={`${cards.paymentSuccessRate}%`} />
        </div>
      </section>

      <section className="kpi-group" aria-labelledby="kpi-today">
        <h2 className="kpi-group__title" id="kpi-today">Today&apos;s activity</h2>
        <div className="stats stats--3">
          <StatCard icon="calendar" tone="tone-neutral" label="Appointments" value={cards.todayAppointments} href="/admin/appointments" />
          <StatCard icon="wallet" tone="tone-neutral" label="Revenue" value={money(cards.todayRevenue)} href="/admin/payments" />
          <StatCard icon="user" tone="tone-neutral" label="Total Patients" value={cards.totalPatients} href="/admin/patients" />
        </div>
      </section>

      <AttentionBanner cards={cards} />

      <DashboardCharts bookingTrend={bookingTrend} revenueTrend={revenueTrend} />

      <section className="dash-stack">
        <article className="card card--flush">
          <div className="card__head">
            <div><h2 className="card__title"><Icon name="hospital" />Recent Hospitals</h2><p className="card__subtitle">Latest 6 onboarded · newest first</p></div>
            <Link className="link-more" href="/admin/hospitals">View All <Icon name="arrow-right" /></Link>
          </div>
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table table--compact table--stack">
              <thead><tr><th>Hospital</th><th>Location</th><th>Status</th><th>KYC</th><th>Created</th></tr></thead>
              <tbody>
                {recentHospitals.length === 0 && <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><div className="empty"><p>No hospitals yet.</p></div></td></tr>}
                {recentHospitals.map((h) => (
                  <tr key={h.id}>
                    <td data-label="Hospital"><Link href={`/admin/hospitals/${h.id}`} className="text-strong">{h.name}</Link></td>
                    <td data-label="Location" className="text-muted">{h.location || '—'}</td>
                    <td data-label="Status">{statusBadge(h.status)}</td>
                    <td data-label="KYC">{kycBadge(h.kycStatus)}</td>
                    <td data-label="Created" className="nowrap">{formatDate(h.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card card--flush">
          <div className="card__head">
            <div><h2 className="card__title"><Icon name="calendar-check" />Recent Appointments</h2><p className="card__subtitle">Latest 6 bookings · all hospitals</p></div>
            <Link className="link-more" href="/admin/appointments">View All <Icon name="arrow-right" /></Link>
          </div>
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table table--compact table--stack">
              <thead><tr><th>Appointment</th><th>Patient</th><th>Hospital</th><th>Doctor</th><th>Date</th><th>Payment</th></tr></thead>
              <tbody>
                {recentAppointments.length === 0 && <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><div className="empty"><p>No appointments yet.</p></div></td></tr>}
                {recentAppointments.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Appointment" className="mono">{a.id}</td>
                    <td data-label="Patient">{a.patientName}</td>
                    <td data-label="Hospital" className="text-muted">{a.hospitalName}</td>
                    <td data-label="Doctor" className="text-muted">{a.doctorName}</td>
                    <td data-label="Date" className="nowrap">{formatDate(a.date)}</td>
                    <td data-label="Payment"><span className={`badge badge--${a.paymentStatus}`}>{a.paymentStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
}
