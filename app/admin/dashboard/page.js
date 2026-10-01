import Link from 'next/link';
import Icon from '../../../components/Icon';
import DashboardCharts, { HospitalGrowthChart } from '../../../components/admin/DashboardCharts';
import getDashboardData from '../../../lib/admin/getDashboardData';

export const metadata = { title: 'Super Admin Dashboard · Gmedic' };
export const dynamic = 'force-dynamic';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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

  const { cards, bookingTrend, revenueTrend, qrFunnel, hospitalGrowth, recentHospitals, recentAppointments, pending } = data;
  const pendingTotal = pending.kyc.length + pending.doctorVerification.length + pending.refunds.length + pending.supportTickets.length + pending.paymentIssues.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Platform Dashboard</h1>
          <p>A live, platform-wide view across every hospital on Gmedic.</p>
        </div>
      </div>

      <section className="stats" aria-label="Platform summary">
        <StatCard icon="hospital" tone="tone-blue" label="Total Hospitals" value={cards.totalHospitals} href="/admin/hospitals" />
        <StatCard icon="check-circle" tone="tone-green" label="Active Hospitals" value={cards.activeHospitals} href="/admin/hospitals?status=ACTIVE" />
        <StatCard icon="alert" tone="tone-red" label="Suspended Hospitals" value={cards.suspendedHospitals} href="/admin/hospitals?status=SUSPENDED" />
        <StatCard icon="stethoscope" tone="tone-violet" label="Total Doctors" value={cards.totalDoctors} href="/admin/doctors" />
        <StatCard icon="users" tone="tone-teal" label="Total Receptionists" value={cards.totalReceptionists} href="/admin/receptionists" />
        <StatCard icon="user" tone="tone-amber" label="Total Patients" value={cards.totalPatients} href="/admin/patients" />
        <StatCard icon="calendar" tone="tone-blue" label="Today's Appointments" value={cards.todayAppointments} href="/admin/appointments" />
        <StatCard icon="wallet" tone="tone-green" label="Today's Revenue" value={money(cards.todayRevenue)} href="/admin/payments" />
        <StatCard icon="trending-up" tone="tone-teal" label="Payment Success Rate" value={`${cards.paymentSuccessRate}%`} />
        <StatCard icon="clipboard-list" tone="tone-amber" label="Pending KYC" value={cards.pendingKyc} href="/admin/hospitals?kycStatus=PENDING" />
        <StatCard icon="refresh" tone="tone-red" label="Pending Refunds" value={cards.pendingRefunds} href="/admin/refunds?status=PENDING" />
        <StatCard icon="qr-code" tone="tone-violet" label="Today's QR Scans" value={cards.todayQrScans} href="/admin/qr" />
      </section>

      <DashboardCharts bookingTrend={bookingTrend} revenueTrend={revenueTrend} qrFunnel={qrFunnel} />

      <section className="dash-grid dash-grid--bottom">
        <div className="dash-stack">
          <article className="card card--flush">
            <div className="card__head">
              <h2 className="card__title"><Icon name="hospital" />Recent Hospitals</h2>
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
                      <td data-label="Created" className="nowrap">{fmtDate(h.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card card--flush">
            <div className="card__head">
              <h2 className="card__title"><Icon name="calendar-check" />Recent Appointments</h2>
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
                      <td data-label="Date" className="nowrap">{a.date}</td>
                      <td data-label="Payment"><span className={`badge badge--${a.paymentStatus}`}>{a.paymentStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="bar-chart" />Hospital Growth</h2></div>
            <HospitalGrowthChart hospitalGrowth={hospitalGrowth} />
          </article>
        </div>

        <article className="card">
          <div className="card__head">
            <h2 className="card__title"><Icon name="alert-triangle" />Pending Actions</h2>
            {pendingTotal > 0 && <span className="badge badge--pending badge--plain">{pendingTotal}</span>}
          </div>
          {pendingTotal === 0 && <p className="text-muted">Nothing needs your attention right now.</p>}

          {pending.kyc.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Hospitals waiting for KYC</h3>
              {pending.kyc.map((h) => (
                <Link key={h.id} href={`/admin/hospitals/${h.id}`} className="qa" style={{ marginBottom: 8 }}>
                  <span className="qa__icon tone-amber"><Icon name="clipboard-list" /></span>
                  <span className="qa__text"><strong>{h.name}</strong><small>{h.kycStatus.replace('_', ' ')}</small></span>
                  <Icon name="chevron-right" />
                </Link>
              ))}
            </div>
          )}
          {pending.doctorVerification.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Doctors pending verification</h3>
              {pending.doctorVerification.map((d) => (
                <Link key={d.id} href={`/admin/doctors?q=${encodeURIComponent(d.id)}`} className="qa" style={{ marginBottom: 8 }}>
                  <span className="qa__icon tone-violet"><Icon name="stethoscope" /></span>
                  <span className="qa__text"><strong>{d.name}</strong><small>{d.hospitalId}</small></span>
                  <Icon name="chevron-right" />
                </Link>
              ))}
            </div>
          )}
          {pending.refunds.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Pending refunds</h3>
              {pending.refunds.map((r) => (
                <Link key={r.id} href="/admin/refunds" className="qa" style={{ marginBottom: 8 }}>
                  <span className="qa__icon tone-red"><Icon name="refresh" /></span>
                  <span className="qa__text"><strong>{money(r.amount)}</strong><small>{r.hospitalName}</small></span>
                  <Icon name="chevron-right" />
                </Link>
              ))}
            </div>
          )}
          {pending.supportTickets.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Open support tickets</h3>
              {pending.supportTickets.map((t) => (
                <Link key={t.id} href="/admin/support" className="qa" style={{ marginBottom: 8 }}>
                  <span className="qa__icon tone-blue"><Icon name="life-buoy" /></span>
                  <span className="qa__text"><strong>{t.subject}</strong><small>{t.priority}</small></span>
                  <Icon name="chevron-right" />
                </Link>
              ))}
            </div>
          )}
          {pending.paymentIssues.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Payment issues</h3>
              {pending.paymentIssues.map((p) => (
                <Link key={p.id} href="/admin/payments" className="qa" style={{ marginBottom: 8 }}>
                  <span className="qa__icon tone-red"><Icon name="credit-card" /></span>
                  <span className="qa__text"><strong>{p.transactionId}</strong><small>{p.reason || 'Failed'}</small></span>
                  <Icon name="chevron-right" />
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
