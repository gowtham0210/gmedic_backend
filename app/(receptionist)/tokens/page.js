import Script from 'next/script';
import Icon from '../../../components/Icon';
import TokenGenerateModal from '../../../components/receptionist/modals/TokenGenerateModal';
import TokenDetailModal from '../../../components/receptionist/modals/TokenDetailModal';
import { requireReceptionist } from '../../../lib/rbac';

export const metadata = { title: 'Token Management · Gmedic' };

export default async function TokensPage() {
  await requireReceptionist();

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><Icon name="chevron-right" /><span>Tokens</span></nav>
          <h1>Token Management</h1>
          <p>Issue queue tokens for patient visits and track their status. <span data-date-label></span></p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" data-open-generate><Icon name="plus" />Generate Token</button>
        </div>
      </div>

      <section className="summary-strip" aria-label="Token overview">
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="ticket" /></span><div><div className="mini-stat__label">Total Tokens</div><div className="mini-stat__value" data-sum="total">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="hourglass" /></span><div><div className="mini-stat__label">Waiting</div><div className="mini-stat__value" data-sum="waiting">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-violet"><Icon name="megaphone" /></span><div><div className="mini-stat__label">Called</div><div className="mini-stat__value" data-sum="called">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Completed</div><div className="mini-stat__value" data-sum="completed">–</div></div></div>
      </section>

      <article className="card card--flush">
        <form className="toolbar" data-filters role="search">
          <div className="field toolbar__search">
            <label htmlFor="t-q">Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" id="t-q" name="q" type="search" placeholder="Token number or patient" /></div>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="t-date">Date</label>
            <input className="input" id="t-date" name="date" type="date" />
          </div>
          <div className="field toolbar__item">
            <label htmlFor="t-doctor">Doctor</label>
            <select className="select" id="t-doctor" name="doctorId"><option value="">All doctors</option></select>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="t-status">Token status</label>
            <select className="select" id="t-status" name="status">
              <option value="">All</option>
              <option value="waiting">Waiting</option>
              <option value="called">Called</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <button type="reset" className="btn btn--ghost" data-reset><Icon name="refresh" />Reset</button>
        </form>

        <div className="tabs" role="tablist" aria-label="Token status" data-status-tabs>
          <button type="button" role="tab" className="tab is-active" data-status="">All <span className="tab__count" data-count="total">–</span></button>
          <button type="button" role="tab" className="tab" data-status="waiting">Waiting <span className="tab__count" data-count="waiting">–</span></button>
          <button type="button" role="tab" className="tab" data-status="called">Called <span className="tab__count" data-count="called">–</span></button>
          <button type="button" role="tab" className="tab" data-status="completed">Completed <span className="tab__count" data-count="completed">–</span></button>
          <button type="button" role="tab" className="tab" data-status="cancelled">Cancelled <span className="tab__count" data-count="cancelled">–</span></button>
        </div>

        <div className="table-wrap" style={{ padding: '14px 8px 0' }}>
          <table className="table table--stack">
            <thead>
              <tr><th>Token</th><th>Patient Name</th><th>Doctor</th><th>Specialist</th><th>Appointment Time</th><th>Token Status</th><th className="col-actions">Action</th></tr>
            </thead>
            <tbody data-token-rows>
              <tr><td colSpan={7}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>
            </tbody>
          </table>
        </div>
        <div className="pager"><span data-token-count></span></div>
      </article>

      <TokenGenerateModal />
      <TokenDetailModal />
      <Script src="/js/pages/tokens.js" strategy="afterInteractive" />
    </>
  );
}
