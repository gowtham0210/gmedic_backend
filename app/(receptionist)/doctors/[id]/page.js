import Script from 'next/script';
import Icon from '../../../../components/Icon';
import AppointmentModal from '../../../../components/receptionist/modals/AppointmentModal';
import BookAppointmentModal from '../../../../components/receptionist/modals/BookAppointmentModal';
import CollectPaymentModal from '../../../../components/receptionist/modals/CollectPaymentModal';
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
          <button type="button" className="btn btn--ghost" style={{ color: 'var(--red-600)' }} data-doctor-status hidden><Icon name="user-x" /><span>Deactivate doctor</span></button>
          <button type="button" className="btn btn--primary" data-open-book data-doctor-id={doctor.id}><Icon name="plus" />Book Appointment</button>
        </div>
      </div>

      <div className="modal" id="doctor-status-modal" role="dialog" aria-modal="true" aria-labelledby="doctor-status-title" hidden>
        <div className="modal__backdrop" data-modal-close></div>
        <div className="modal__panel modal__panel--sm">
          <form id="doctor-status-form" noValidate>
            <div className="modal__head">
              <div className="modal__icon tone-red" data-status-icon><Icon name="user-x" /></div>
              <div><h2 id="doctor-status-title" data-status-title>Deactivate doctor?</h2><p data-status-body></p></div>
            </div>
            <div className="modal__body" data-status-fields>
              <p className="note" style={{ marginTop: 0, marginBottom: 14 }}><Icon name="info" /><span data-status-impact>Checking upcoming appointments…</span></p>
              <div className="field">
                <label htmlFor="doctor-status-reason" className="field__label">Reason *</label>
                <textarea className="textarea" id="doctor-status-reason" name="reason" rows={3} maxLength={300} placeholder="e.g. Left the hospital on 30 Sep"></textarea>
                <p className="field__error" data-error-for="reason"></p>
              </div>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
              <button type="submit" className="btn btn--danger" data-status-submit>Deactivate Doctor</button>
            </div>
          </form>
        </div>
      </div>

      <div className="modal" id="doctor-login-modal" role="dialog" aria-modal="true" aria-labelledby="doctor-login-title" hidden>
        <div className="modal__backdrop" data-modal-close></div>
        <div className="modal__panel modal__panel--sm">
          <form id="doctor-login-form" noValidate>
            <div className="modal__head">
              <div className="modal__icon tone-blue"><Icon name="user-check" /></div>
              <div><h2 id="doctor-login-title">Invite to the doctor portal</h2><p>The doctor signs in with this email and a temporary password, which they must change at first sign-in.</p></div>
              <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="modal__body">
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
              <div className="field">
                <label htmlFor="dl-email">Email *</label>
                <input className="input" id="dl-email" name="email" type="email" maxLength={120} required placeholder="doctor@hospital.com" />
                <p className="field__error" data-error-for="email"></p>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="dl-phone">Mobile</label>
                <input className="input" id="dl-phone" name="phone" type="tel" maxLength={20} placeholder="Optional" />
                <p className="field__error" data-error-for="phone"></p>
              </div>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
              <button type="submit" className="btn btn--primary" data-login-submit><Icon name="check" /><span>Invite Doctor</span></button>
            </div>
          </form>
        </div>
      </div>

      <div className="modal" id="doctor-creds-modal" role="dialog" aria-modal="true" aria-labelledby="doctor-creds-title" hidden>
        <div className="modal__backdrop"></div>
        <div className="modal__panel modal__panel--sm">
          <div className="modal__head">
            <div className="modal__icon tone-green"><Icon name="check-circle" /></div>
            <div><h2 id="doctor-creds-title">Credentials issued</h2><p>Share these with the doctor securely. The temporary password must be changed at first sign-in and is not shown again.</p></div>
          </div>
          <div className="modal__body">
            <dl className="kv">
              <div><dt>Sign in with</dt><dd className="mono" data-creds-login></dd></div>
              <div><dt>Temporary password</dt><dd className="mono" data-creds-password></dd></div>
            </dl>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--primary" data-modal-close>Done</button>
          </div>
        </div>
      </div>

      <div data-doctor-notices></div>

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
                    <legend>Availability today <span className="req">*</span></legend>
                    <div className="segmented">
                      <label className="seg-option seg-option--present"><input type="radio" name="availability" value="present" /><span className="seg-option__dot"></span><span><strong>Present</strong><small>Available for appointments today</small></span></label>
                      <label className="seg-option seg-option--absent"><input type="radio" name="availability" value="absent" /><span className="seg-option__dot"></span><span><strong>Absent / On Leave</strong><small>Not available today only. Back tomorrow; use a leave for several days.</small></span></label>
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
          <article className="card" data-login-card style={{ marginBottom: 24 }}>
            <div className="card__head" style={{ paddingBottom: 12 }}>
              <div>
                <h2 className="card__title"><Icon name="user-check" />Doctor portal login</h2>
                <p className="card__subtitle">Lets the doctor see their queue, schedule and leave.</p>
              </div>
            </div>
            <div data-login-body><div className="skeleton skeleton--row"></div></div>
          </article>

          <article className="card card--flush" data-hours-card style={{ marginBottom: 24 }}>
            <div className="card__head">
              <div>
                <h2 className="card__title"><Icon name="clock" />Working hours</h2>
                <p className="card__subtitle" data-hours-note>Weekly hours patients can book. Changes apply from tomorrow.</p>
              </div>
            </div>
            <div className="table-wrap" style={{ padding: '0 8px' }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Day</th><th>Hours</th><th className="num">Slot</th><th className="num">Per slot</th><th className="col-actions"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody data-hours-rows><tr><td colSpan={5}><div className="skeleton skeleton--row"></div></td></tr></tbody>
              </table>
            </div>
            <form data-hours-form noValidate style={{ padding: '14px 16px 16px', borderTop: '1px solid var(--border-2)' }}>
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 12 }}><Icon name="alert" /><span></span></div>
              <div className="form-grid">
                <div className="field"><label htmlFor="h-day">Day</label>
                  <select className="select" id="h-day" name="dayOfWeek">
                    <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option>
                  </select>
                  <p className="field__error" data-error-for="dayOfWeek"></p>
                </div>
                <div className="field"><label htmlFor="h-slot">Minutes per slot</label><input className="input" id="h-slot" name="slotMinutes" type="number" min={5} max={120} step={5} defaultValue={15} /><p className="field__error" data-error-for="slotMinutes"></p></div>
                <div className="field"><label htmlFor="h-start">From</label><input className="input" id="h-start" name="startTime" type="time" defaultValue="09:00" /><p className="field__error" data-error-for="startTime"></p></div>
                <div className="field"><label htmlFor="h-end">To</label><input className="input" id="h-end" name="endTime" type="time" defaultValue="13:00" /><p className="field__error" data-error-for="endTime"></p></div>
                <div className="field"><label htmlFor="h-cap">Patients per slot</label><input className="input" id="h-cap" name="capacityPerSlot" type="number" min={1} max={50} step={1} defaultValue={1} /><p className="field__error" data-error-for="capacityPerSlot"></p></div>
              </div>
              <button type="submit" className="btn btn--primary btn--sm" style={{ marginTop: 12 }} data-hours-add><Icon name="plus" /><span>Add working hours</span></button>
            </form>
          </article>

          <article className="card card--flush" data-walkin-card style={{ marginBottom: 24 }}>
            <div className="card__head">
              <div>
                <h2 className="card__title"><Icon name="users" />Walk-in seats</h2>
                <p className="card__subtitle">Per slot · seats the Gmedic app can&apos;t book, and emergency walk-ins (0–3) a full slot can still take today</p>
              </div>
            </div>
            <form data-walkin-form noValidate>
              <div className="alert alert--error" hidden data-form-alert style={{ margin: '0 16px 12px' }}><Icon name="alert" /><span></span></div>
              <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
                <table className="table table--compact table--stack">
                  <thead><tr><th>Hours</th><th className="num">Per slot</th><th className="num">Walk-in</th><th className="num">App</th><th className="num">Emergency</th></tr></thead>
                  <tbody data-walkin-rows><tr><td colSpan={5}><div className="skeleton skeleton--row"></div></td></tr></tbody>
                </table>
              </div>
              <div className="pager" style={{ justifyContent: 'space-between' }}>
                <span className="text-muted" style={{ fontSize: 12.5 }}>Applies now. Bookings already made are kept.</span>
                <button type="submit" className="btn btn--primary btn--sm" data-walkin-save disabled><Icon name="check" /><span>Save</span></button>
              </div>
            </form>
          </article>

          <article className="card card--flush" style={{ marginBottom: 24 }}>
            <div className="card__head">
              <div>
                <h2 className="card__title"><Icon name="calendar-x" />Leaves</h2>
                <p className="card__subtitle">Days the doctor is away. Set by the doctor; bookings inside a leave need to be moved.</p>
              </div>
            </div>
            <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Dates</th><th>Reason</th><th>Booked</th></tr></thead>
                <tbody data-leave-rows><tr><td colSpan={3}><div className="skeleton skeleton--row"></div></td></tr></tbody>
              </table>
            </div>
          </article>

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
      <BookAppointmentModal />
      <CollectPaymentModal />
      <Script src="/js/collect-payment.js" strategy="afterInteractive" />
      <Script src="/js/appointment-modal.js" strategy="afterInteractive" />
      <Script src="/js/book-appointment.js" strategy="afterInteractive" />
      <Script src="/js/doctor-hours.js" strategy="afterInteractive" />
      <Script src="/js/walk-in-seats.js" strategy="afterInteractive" />
      <Script src="/js/pages/doctor-detail.js" strategy="afterInteractive" />
    </>
  );
}
