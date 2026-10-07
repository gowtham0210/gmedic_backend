import Script from 'next/script';
import Icon from '../../../components/Icon';
import DoctorFormModal from '../../../components/receptionist/modals/DoctorFormModal';
import AvailabilityModal from '../../../components/receptionist/modals/AvailabilityModal';
import QrModal from '../../../components/receptionist/modals/QrModal';
import { requireReceptionist } from '../../../lib/rbac';
import hospitalModel from '../../../models/hospitalModel';
import config from '../../../config';

export const metadata = { title: 'Dashboard · Gmedic' };

export default async function DashboardPage() {
  const user = await requireReceptionist();
  const hospital = await hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId));

  return (
    <>
      <section className="welcome-row">
        <div className="welcome">
          <div className="welcome__text">
            <h1><span data-greeting>Hello</span>, {user.name.split(' ')[0]}! <span className="wave" aria-hidden="true">👋</span></h1>
            <p className="welcome__lead">Welcome to <span className="text-brand">Gmedic</span> Receptionist Portal</p>
            <p className="welcome__sub">Manage doctors, appointments, and hospital information all in one place.</p>
          </div>
          <img className="welcome__art" src="/images/hospital-illustration.svg" alt="" aria-hidden="true" />
        </div>
        <div className="date-card">
          <span className="date-card__icon"><Icon name="calendar" /></span>
          <div>
            <strong data-today-date>&nbsp;</strong>
            <span data-today-day>&nbsp;</span>
            <small className="date-card__time" data-today-time></small>
          </div>
        </div>
      </section>

      <section className="stats" id="stats" aria-label="Summary">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="card stat" key={i}>
            <span className="skeleton" style={{ width: 52, height: 52, borderRadius: 6 }}></span>
            <div style={{ flex: 1 }}>
              <span className="skeleton skeleton--text" style={{ width: '70%' }}></span>
              <span className="skeleton" style={{ width: '40%', height: 26, marginTop: 10 }}></span>
              <span className="skeleton skeleton--text" style={{ width: '80%', marginTop: 12 }}></span>
            </div>
          </div>
        ))}
      </section>

      <section className="dash-grid">
        <article className="card" id="availability-card">
          <div className="card__head">
            <h2 className="card__title"><Icon name="stethoscope" />Doctor Availability</h2>
            <a className="link-more" href="/doctors">View All <Icon name="arrow-right" /></a>
          </div>
          <div data-availability><div className="skeleton" style={{ height: 150 }}></div></div>
        </article>

        <article className="card card--flush" id="today-card">
          <div className="card__head">
            <div><h2 className="card__title"><Icon name="calendar" />Today&apos;s Appointments</h2></div>
            <a className="link-more" href="/appointments?date=today">View All <Icon name="arrow-right" /></a>
          </div>
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table table--compact table--stack">
              <thead><tr><th>Patient</th><th>Doctor</th><th>Specialist</th><th>Time</th><th>Status</th><th>Payment</th></tr></thead>
              <tbody data-today-rows>
                <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className="card" id="hospital-card">
          <div className="card__head">
            <h2 className="card__title"><Icon name="hospital" />Hospital Information</h2>
            <a className="btn btn--ghost btn--sm" href="/hospital#edit"><Icon name="pencil" />Edit</a>
          </div>
          <div className="hosp-summary">
            <div className="hosp-thumb"><img src="/images/hospital-illustration.svg" alt="" /></div>
            <div>
              <h3 data-h-name>{hospital.name}</h3>
              <p>Hospital ID: <strong className="text-strong">{hospital.id}</strong></p>
            </div>
          </div>
          <ul className="contact-list">
            <li><Icon name="phone" /><a href={`tel:${hospital.phone.replace(/\s/g, '')}`} data-h-phone>{hospital.phone}</a></li>
            <li><Icon name="mail" /><a href={`mailto:${hospital.email}`} data-h-email>{hospital.email}</a></li>
            <li><Icon name="map-pin" /><span data-h-address>{hospital.addressText}</span></li>
          </ul>
          <div className="qr-panel">
            <div className="qr-panel__img"><img src="/api/hospital/qr.svg" alt="Hospital QR code" /></div>
            <div>
              <h4>Your Hospital QR Code</h4>
              <p>Patients scan this QR code at the reception to add this hospital in the Gmedic app.</p>
            </div>
            <div className="qr-panel__actions">
              <button type="button" className="btn btn--primary btn--sm" data-download-poster><Icon name="download" /><span>Download QR</span></button>
              <button type="button" className="btn btn--outline btn--sm" data-open-qr><Icon name="eye" />View QR</button>
            </div>
          </div>
        </article>
      </section>

      <section className="dash-grid dash-grid--bottom">
        <article className="card card--flush">
          <div className="card__head">
            <div>
              <h2 className="card__title"><Icon name="calendar-check" />Recent Appointments</h2>
              <p className="card__subtitle">Latest bookings from the Gmedic app</p>
            </div>
            <a className="link-more" href="/appointments">View All <Icon name="arrow-right" /></a>
          </div>
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table table--compact table--stack">
              <thead><tr><th>Date</th><th>Patient Name</th><th>Doctor</th><th>Specialist</th><th>Time</th><th className="num">Fee</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody data-recent-rows>
                <tr><td colSpan={8}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>
              </tbody>
            </table>
          </div>
        </article>

        <div className="dash-stack">
          <article className="card" id="tokens-card">
            <div className="card__head">
              <h2 className="card__title"><Icon name="ticket" />Today&apos;s Tokens</h2>
            </div>
            <div data-token-summary>
              <div className="skeleton" style={{ height: 64 }}></div>
            </div>
          </article>

          <article className="card">
            <div className="card__head"><h2 className="card__title"><Icon name="zap" />Quick Actions</h2></div>
            <div className="qa-list">
              <button type="button" className="qa" data-open-add-doctor>
                <span className="qa__icon tone-blue"><Icon name="user-plus" /></span>
                <span className="qa__text"><strong>Add Doctor</strong><small>Register a new doctor</small></span>
                <Icon name="chevron-right" />
              </button>
              <button type="button" className="qa" data-open-availability>
                <span className="qa__icon tone-green"><Icon name="user-check" /></span>
                <span className="qa__text"><strong>Update Availability</strong><small>Mark present / absent</small></span>
                <Icon name="chevron-right" />
              </button>
              <a className="qa" href="/appointments">
                <span className="qa__icon tone-violet"><Icon name="calendar" /></span>
                <span className="qa__text"><strong>View Appointments</strong><small>Check patient bookings</small></span>
                <Icon name="chevron-right" />
              </a>
              <a className="qa" href="/payments">
                <span className="qa__icon tone-amber"><Icon name="wallet" /></span>
                <span className="qa__text"><strong>View Payments</strong><small>Track payment status</small></span>
                <Icon name="chevron-right" />
              </a>
            </div>
          </article>
        </div>
      </section>

      <DoctorFormModal hospitalName={hospital.name} specializations={config.specializations} />
      <AvailabilityModal />
      <QrModal hospitalName={hospital.name} />

      <Script src="/js/doctor-modals.js" strategy="afterInteractive" />
      <Script src="/js/qr-modal.js" strategy="afterInteractive" />
      <Script src="/js/pages/dashboard.js" strategy="afterInteractive" />
    </>
  );
}
