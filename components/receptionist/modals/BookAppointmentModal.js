import Icon from '../../Icon';

// Front-desk booking: doctor + date, a slot grid with live seat counts (full slots greyed out; a full
// slot that can still take an emergency walk-in stays pickable, in red), then the patient.
// Driven by public/js/book-appointment.js; fires `appointments:changed`.
export default function BookAppointmentModal() {
  return (
    <div className="modal" id="book-appointment-modal" role="dialog" aria-modal="true" aria-labelledby="book-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--lg">
        <form id="book-form" noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-neutral"><Icon name="calendar-check" /></div>
            <div>
              <h2 id="book-title">Book appointment</h2>
              <p>Walk-in or phone booking. Seats and token numbers are shared with the Gmedic app.</p>
            </div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>

          <div className="modal__body">
            <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="b-doctor">Doctor <span className="req">*</span></label>
                <select className="select" id="b-doctor" name="doctorId" required><option value="">Choose a doctor</option></select>
                <p className="field__error" data-error-for="doctorId"></p>
              </div>
              <div className="field">
                <label htmlFor="b-date">Date <span className="req">*</span></label>
                <input className="input" id="b-date" name="date" type="date" required />
                <p className="field__error" data-error-for="date"></p>
              </div>
            </div>

            <fieldset className="field field--full slot-picker">
              <legend>Slot <span className="req">*</span></legend>
              <div className="slot-picker__meta">
                <span data-slot-summary className="text-muted">Choose a doctor and date to see free slots.</span>
                <span className="slot-legend" aria-hidden="true">
                  <span><i className="slot-legend__swatch"></i>Available</span>
                  <span><i className="slot-legend__swatch slot-legend__swatch--emergency"></i>Emergency only</span>
                  <span><i className="slot-legend__swatch slot-legend__swatch--full"></i>Full</span>
                  <span className="slot-live" data-live-state></span>
                </span>
              </div>
              <div className="slot-grid" role="radiogroup" aria-label="Slots" data-slot-grid></div>
              <p className="field__error" data-error-for="time"></p>
              {/* Shown when a full slot is picked: this booking is an emergency walk-in over capacity. */}
              <div className="alert alert--error" hidden data-emergency-note style={{ marginTop: 12 }}><Icon name="alert" /><span></span></div>
            </fieldset>

            <div className="divider"></div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="b-mobile">Patient mobile <span className="req">*</span></label>
                <div className="input-wrap"><span className="input-affix">+91</span><input className="input" id="b-mobile" name="mobile" type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" required /></div>
                <p className="field__hint" data-patient-hint>If this number is already on file, you can pick that patient.</p>
                <p className="field__error" data-error-for="patient.mobile"></p>
              </div>
              <div className="field">
                <label htmlFor="b-name">Patient name <span className="req">*</span></label>
                <input className="input" id="b-name" name="name" maxLength={80} placeholder="Full name" required />
                <p className="field__error" data-error-for="patient.name"></p>
              </div>
              <div className="field">
                <label htmlFor="b-gender">Gender</label>
                <select className="select" id="b-gender" name="gender">
                  <option value="">Not given</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
                <p className="field__error" data-error-for="patient.gender"></p>
              </div>
              <div className="field">
                <label htmlFor="b-reason">Reason for visit</label>
                <input className="input" id="b-reason" name="reason" maxLength={300} placeholder="Optional" />
              </div>
              <div className="field">
                <label htmlFor="b-channel">How did they book?</label>
                <select className="select" id="b-channel" name="channel">
                  <option value="walkin">At the desk (walk-in)</option>
                  <option value="phone">By phone</option>
                </select>
              </div>
            </div>
            {/* Shown when the number is already on file under another name: same person, or someone sharing the phone? */}
            <div className="alert alert--info" hidden data-patient-conflict style={{ marginTop: 16, alignItems: 'flex-start' }}>
              <Icon name="info" />
              <div style={{ flex: 1 }}>
                <p data-conflict-text style={{ margin: 0 }}></p>
                <div className="action-group" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn--primary btn--sm" data-conflict-same></button>
                  <button type="button" className="btn btn--ghost btn--sm" data-conflict-different></button>
                </div>
              </div>
            </div>
          </div>

          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
            <button type="submit" className="btn btn--primary" data-book-submit><Icon name="check" /><span data-book-label>Book Appointment</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
