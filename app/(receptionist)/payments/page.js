import Script from 'next/script';
import Icon from '../../../components/Icon';
import RefundRequestModal from '../../../components/receptionist/RefundRequestModal';
import CollectPaymentModal from '../../../components/receptionist/modals/CollectPaymentModal';
import { requireReceptionist } from '../../../lib/rbac';

export const metadata = { title: 'Payments · Gmedic' };

export default async function PaymentsPage() {
  await requireReceptionist();

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><Icon name="chevron-right" /><span>Payments</span></nav>
          <h1>Payments</h1>
          <p>Payment status for appointments. Patients pay in the Gmedic app, or at the front desk where you record it here.</p>
        </div>
        <div className="chips" role="group" aria-label="Quick date range" data-date-chips>
          <button type="button" className="chip" data-range="today">Today</button>
          <button type="button" className="chip" data-range="7d">Last 7 days</button>
          <button type="button" className="chip" data-range="30d">Last 30 days</button>
          <button type="button" className="chip" data-range="all">All</button>
        </div>
      </div>

      <section className="summary-strip" aria-label="Payment summary">
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="wallet" /></span><div><div className="mini-stat__label">Collected</div><div className="mini-stat__value" data-sum="collected">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="clock" /></span><div><div className="mini-stat__label">Pending amount</div><div className="mini-stat__value" data-sum="pendingAmount">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Paid appointments</div><div className="mini-stat__value" data-sum="paidCount">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-red"><Icon name="receipt" /></span><div><div className="mini-stat__label">Awaiting payment</div><div className="mini-stat__value" data-sum="pendingCount">–</div></div></div>
      </section>

      <article className="card card--flush">
        <form className="toolbar" data-filters role="search">
          <div className="field toolbar__search">
            <label htmlFor="p-q">Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" id="p-q" name="q" type="search" placeholder="Patient, doctor or transaction ID" /></div>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="p-from">From</label>
            <input className="input" id="p-from" name="from" type="date" />
          </div>
          <div className="field toolbar__item">
            <label htmlFor="p-to">To</label>
            <input className="input" id="p-to" name="to" type="date" />
          </div>
          <div className="field toolbar__item">
            <label htmlFor="p-doctor">Doctor</label>
            <select className="select" id="p-doctor" name="doctorId"><option value="">All doctors</option></select>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="p-status">Payment status</label>
            <select className="select" id="p-status" name="paymentStatus">
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <button type="reset" className="btn btn--ghost" data-reset><Icon name="refresh" />Reset</button>
        </form>

        <div className="table-wrap" style={{ padding: '14px 8px 0' }}>
          <table className="table table--stack">
            <thead>
              <tr><th>Patient</th><th>Doctor</th><th>Appointment Date</th><th>Appointment Time</th><th className="num">Fee</th><th>Method</th><th>Payment Status</th><th className="col-actions">Actions</th></tr>
            </thead>
            <tbody data-pay-rows>
              <tr><td colSpan={8}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>
            </tbody>
          </table>
        </div>
        <div className="pager" data-pager></div>
      </article>

      <article className="card card--flush" style={{ marginTop: 20 }}>
        <div className="card__head"><h2 className="card__title"><Icon name="refresh" />Refund requests</h2></div>
        <div className="table-wrap" style={{ padding: '0 8px' }}>
          <table className="table table--stack">
            <thead><tr><th>Request</th><th>Patient</th><th className="num">Amount</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody data-refund-rows>
              <tr><td colSpan={5}><div className="skeleton skeleton--row"></div></td></tr>
            </tbody>
          </table>
        </div>
        <div className="pager" data-refund-pager></div>
      </article>

      <RefundRequestModal />
      <CollectPaymentModal />
      <Script src="/js/collect-payment.js" strategy="afterInteractive" />
      <Script src="/js/pages/payments.js" strategy="afterInteractive" />
    </>
  );
}
