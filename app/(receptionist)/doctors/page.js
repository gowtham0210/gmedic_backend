import Script from 'next/script';
import Icon from '../../../components/Icon';
import DoctorFormModal from '../../../components/receptionist/modals/DoctorFormModal';
import AvailabilityModal from '../../../components/receptionist/modals/AvailabilityModal';
import { requireReceptionist } from '../../../lib/rbac';
import hospitalModel from '../../../models/hospitalModel';
import config from '../../../config';

export const metadata = { title: 'Doctors · Gmedic' };

export default async function DoctorsPage() {
  const user = await requireReceptionist();
  const hospital = await hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId));

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><Icon name="chevron-right" /><span>Doctors</span></nav>
          <h1>Doctors</h1>
          <p>Manage doctors, appointment fees and today&apos;s availability.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--ghost" data-open-availability><Icon name="user-check" />Update Availability</button>
          <button type="button" className="btn btn--primary" data-open-add-doctor><Icon name="plus" />Add Doctor</button>
        </div>
      </div>

      <section className="summary-strip summary-strip--3" data-doctor-summary>
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="users" /></span><div><div className="mini-stat__label">Total Doctors</div><div className="mini-stat__value" data-sum="total">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="user-check" /></span><div><div className="mini-stat__label">Present Today</div><div className="mini-stat__value" data-sum="present">–</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-red"><Icon name="user-x" /></span><div><div className="mini-stat__label">Absent / On Leave</div><div className="mini-stat__value" data-sum="absent">–</div></div></div>
      </section>

      <article className="card card--flush">
        <form className="toolbar" data-filters role="search">
          <div className="field toolbar__search">
            <label htmlFor="f-q">Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" id="f-q" name="q" type="search" placeholder="Doctor name or ID" /></div>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="f-spec">Specialist</label>
            <select className="select" id="f-spec" name="specialization">
              <option value="">All specialisations</option>
              {config.specializations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label htmlFor="f-avail">Availability</label>
            <select className="select" id="f-avail" name="availability">
              <option value="">All</option>
              <option value="present">Present</option>
              <option value="absent">Absent / On Leave</option>
            </select>
          </div>
          <button type="reset" className="btn btn--ghost" data-reset><Icon name="refresh" />Reset</button>
        </form>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead>
              <tr><th>Doctor</th><th>Specialist</th><th className="num">Appointment Fee</th><th>Today</th><th>Availability</th><th className="col-actions">Actions</th></tr>
            </thead>
            <tbody data-doctor-rows>
              <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>
            </tbody>
          </table>
        </div>
        <div className="pager"><span data-doctor-count></span></div>
      </article>

      <DoctorFormModal hospitalName={hospital.name} specializations={config.specializations} />
      <AvailabilityModal />
      <Script src="/js/doctor-modals.js" strategy="afterInteractive" />
      <Script src="/js/pages/doctors.js" strategy="afterInteractive" />
    </>
  );
}
