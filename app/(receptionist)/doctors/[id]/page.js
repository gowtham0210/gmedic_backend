import Script from 'next/script';
import Icon from '../../../../components/Icon';
import AppointmentModal from '../../../../components/receptionist/modals/AppointmentModal';
import { requireReceptionist } from '../../../../lib/rbac';
import doctorModel from '../../../../models/doctorModel';
import config from '../../../../config';

export default async function DoctorDetailPage({ params }) {
  const user = await requireReceptionist();
  const { id } = await params;
  const doctor = await doctorModel.findById(user.hospitalId, id);
  if (!doctor) {
    // Reused API route handles the real 404 body; this page just needs to not crash.
    return (
      <div className="alert alert--error"><Icon name="alert" /><span>This doctor could not be found.</span></div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><Icon name="chevron-right" /><a href="/doctors">Doctors</a><Icon name="chevron-right" /><span data-crumb>{doctor.name}</span></nav>
          <h1>Doctor Details</h1>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--ghost" href="/doctors"><Icon name="arrow-left" />Back to doctors</a>
        </div>
      </div>

      <div className="two-col" data-doctor-id={doctor.id}>
        <div>
          <article className="card">
            <div className="profile-hero" data-doctor-hero>
              <div className="skeleton" style={{ width: 76, height: 76, borderRadius: 8 }}></div>
              <div className="profile-hero__main"><div className="skeleton skeleton--text" style={{ width: '50%', height: 20 }}></div><div className="skeleton skeleton--text" style={{ width: '35%', marginTop: 12 }}></div></div>
            </div>
            <div className="kpis" data-doctor-kpis></div>
          </article>

          <article className="card" style={{ marginTop: 24 }}>
            <div className="card__head" style={{ paddingBottom: 18, borderBottom: '1px solid var(--border-2)' }}>
              <div>
                <h2 className="card__title"><Icon name="pencil" />Doctor information</h2>
                <p className="card__subtitle" data-edit-hint>Click Edit to update this doctor&apos;s details.</p>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" data-start-edit><Icon name="pencil" />Edit</button>
            </div>

            <form id="doctor-detail-form" noValidate>
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
              <fieldset disabled data-edit-fields style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <div className="form-grid">
                  <div className="field field--full">
                    <label htmlFor="d-name">Doctor name <span className="req">*</span></label>
                    <div className="input-wrap"><span className="input-affix">Dr.</span><input className="input" id="d-name" name="name" required minLength={3} maxLength={60} /></div>
                    <p className="field__error" data-error-for="name"></p>
                  </div>
                  <div className="field">
                    <label htmlFor="d-spec">Specialist <span className="req">*</span></label>
                    <select className="select" id="d-spec" name="specialization" required>
                      {config.specializations.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <p className="field__error" data-error-for="specialization"></p>
                  </div>
                  <div className="field">
                    <label htmlFor="d-fee">Appointment fee <span className="req">*</span></label>
                    <div className="input-wrap"><span className="input-affix">₹</span><input className="input" id="d-fee" name="fee" type="number" inputMode="numeric" min={50} max={20000} step={1} required /></div>
                    <p className="field__error" data-error-for="fee"></p>
                  </div>
                  <fieldset className="field field--full">
                    <legend>Availability <span className="req">*</span></legend>
                    <div className="segmented">
                      <label className="seg-option seg-option--present"><input type="radio" name="availability" value="present" /><span className="seg-option__dot"></span><span><strong>Present</strong><small>Available for appointments today</small></span></label>
                      <label className="seg-option seg-option--absent"><input type="radio" name="availability" value="absent" /><span className="seg-option__dot"></span><span><strong>Absent / On Leave</strong><small>Not available today</small></span></label>
                    </div>
                  </fieldset>
                </div>
              </fieldset>
              <div className="form-actions" hidden data-edit-actions>
                <button type="button" className="btn btn--ghost" data-cancel-edit>Cancel</button>
                <button type="submit" className="btn btn--primary"><Icon name="check" /><span>Save</span></button>
              </div>
            </form>
          </article>
        </div>

        <aside>
          <article className="card card--flush">
            <div className="card__head">
              <div>
                <h2 className="card__title"><Icon name="calendar" />Upcoming appointments</h2>
                <p className="card__subtitle">Today and upcoming bookings for this doctor</p>
              </div>
            </div>
            <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Patient</th><th>When</th><th>Status</th></tr></thead>
                <tbody data-schedule-rows><tr><td colSpan={3}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr></tbody>
              </table>
            </div>
            <div className="pager"><a className="link-more" href={`/appointments?doctorId=${doctor.id}`}>View all appointments <Icon name="arrow-right" /></a></div>
          </article>
        </aside>
      </div>

      <AppointmentModal />
      <Script src="/js/appointment-modal.js" strategy="afterInteractive" />
      <Script src="/js/pages/doctor-detail.js" strategy="afterInteractive" />
    </>
  );
}
