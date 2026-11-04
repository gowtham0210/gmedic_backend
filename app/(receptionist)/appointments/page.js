import Script from 'next/script';
import Icon from '../../../components/Icon';
import AppointmentModal from '../../../components/receptionist/modals/AppointmentModal';
import BookAppointmentModal from '../../../components/receptionist/modals/BookAppointmentModal';
import EmergencyWalkInModal from '../../../components/receptionist/modals/EmergencyWalkInModal';
import CollectPaymentModal from '../../../components/receptionist/modals/CollectPaymentModal';
import { requireReceptionist } from '../../../lib/rbac';

export const metadata = { title: 'Appointments · Gmedic' };

export default async function AppointmentsPage() {
  await requireReceptionist();

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><Icon name="chevron-right" /><span>Appointments</span></nav>
          <h1>Appointments</h1>
          <p>Appointments booked in the Gmedic app and at the front desk.</p>
        </div>
        <div className="page-head__actions page-head__actions--split">
          <div className="chips" role="group" aria-label="Quick date range" data-date-chips>
            <button type="button" className="chip" data-range="today">Today</button>
            <button type="button" className="chip" data-range="tomorrow">Tomorrow</button>
            <button type="button" className="chip" data-range="week">Next 7 days</button>
            <button type="button" className="chip" data-range="all">All dates</button>
          </div>
          <div className="page-head__buttons">
            <button type="button" className="btn btn--danger" data-open-emergency hidden><Icon name="alert" />Emergency Walk-in</button>
            <button type="button" className="btn btn--primary" data-open-book><Icon name="plus" />Book Appointment</button>
          </div>
        </div>
      </div>

      <article className="card card--flush">
        <form className="toolbar" data-filters role="search">
          <div className="field toolbar__search">
            <label htmlFor="f-q">Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" id="f-q" name="q" type="search" placeholder="Patient, mobile, doctor or ID" /></div>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="f-date">Date</label>
            <input className="input" id="f-date" name="date" type="date" />
          </div>
          <div className="field toolbar__item">
            <label htmlFor="f-doctor">Doctor</label>
            <select className="select" id="f-doctor" name="doctorId"><option value="">All doctors</option></select>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="f-pay">Payment status</label>
            <select className="select" id="f-pay" name="paymentStatus">
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <button type="reset" className="btn btn--ghost" data-reset><Icon name="refresh" />Reset</button>
        </form>

        <div className="tabs" role="tablist" aria-label="Appointment status" data-status-tabs>
          <button type="button" role="tab" className="tab is-active" data-status="">All <span className="tab__count" data-count="all">–</span></button>
          <button type="button" role="tab" className="tab" data-status="confirmed">Confirmed <span className="tab__count" data-count="confirmed">–</span></button>
          <button type="button" role="tab" className="tab" data-status="pending">Pending <span className="tab__count" data-count="pending">–</span></button>
          <button type="button" role="tab" className="tab" data-status="completed">Completed <span className="tab__count" data-count="completed">–</span></button>
          <button type="button" role="tab" className="tab" data-status="cancelled">Cancelled <span className="tab__count" data-count="cancelled">–</span></button>
          <button type="button" role="tab" className="tab" data-status="no_show">No-show <span className="tab__count" data-count="no_show">–</span></button>
        </div>

        <div className="table-wrap" style={{ padding: '14px 8px 0' }}>
          <table className="table table--stack">
            <thead>
              <tr>
                <th>Patient Name</th><th>Doctor</th><th>Specialist</th>
                <th><button type="button" className="auth__link" style={{ color: 'inherit', fontWeight: 600 }} data-sort aria-label="Sort by date">Date <span data-sort-arrow>↓</span></button></th>
                <th>Time</th><th>Token</th><th className="num">Fee</th><th>Payment Status</th><th>Appointment Status</th><th className="col-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody data-appt-rows>
              <tr><td colSpan={10}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>
            </tbody>
          </table>
        </div>
        <div className="pager" data-pager></div>
      </article>

      <AppointmentModal />
      <BookAppointmentModal />
      <EmergencyWalkInModal />
      <CollectPaymentModal />
      <Script src="/js/collect-payment.js" strategy="afterInteractive" />
      <Script src="/js/appointment-modal.js" strategy="afterInteractive" />
      <Script src="/js/book-appointment.js" strategy="afterInteractive" />
      <Script src="/js/emergency-walkin.js" strategy="afterInteractive" />
      <Script src="/js/pages/appointments.js" strategy="afterInteractive" />
    </>
  );
}
