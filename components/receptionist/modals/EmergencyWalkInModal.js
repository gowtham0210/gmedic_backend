import Icon from '../../Icon';

// Emergency Walk-in: a separate registration for a patient who needs the doctor now. No slot is chosen and no normal
// appointment seat is used; the patient gets an emergency token (E001...) and waits for the doctor's triage.
// Opened by any [data-open-emergency] button (shown only to receptionists an administrator has allowed).
// Driven by public/js/emergency-walkin.js; posts to /api/emergency/walk-ins and fires `appointments:changed`.
export default function EmergencyWalkInModal() {
  return (
    <div className="modal" id="emergency-walkin-modal" role="dialog" aria-modal="true" aria-labelledby="ew-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--lg">
        <form id="emergency-form" noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="alert" /></div>
            <div>
              <h2 id="ew-title">Emergency walk-in</h2>
              <p>For a patient who cannot wait. No slot is needed and no normal appointment seat is used.</p>
            </div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>

          <div className="modal__body" data-ew-form>
            <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
            {/* Intake paused, limit not set, or the doctor is unavailable: says why and where to send the patient. */}
            <div className="alert alert--warning" hidden data-ew-notice style={{ marginBottom: 16, alignItems: 'flex-start' }}><Icon name="alert" /><span></span></div>

            <div className="alert alert--warning" hidden data-ew-workload style={{ marginBottom: 16, alignItems: 'flex-start' }}><Icon name="alert" /><span></span></div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="ew-hospital">Hospital</label>
                <input className="input" id="ew-hospital" data-ew-hospital readOnly />
              </div>
              <div className="field">
                <label htmlFor="ew-dept-filter">Department</label>
                <select className="select" id="ew-dept-filter" name="departmentFilter"><option value="">All departments</option></select>
              </div>
              <div className="field field--full">
                <label id="ew-doctors-label">Doctor <span className="req">*</span></label>
                <div className="ew-doctors" role="radiogroup" aria-labelledby="ew-doctors-label" data-ew-doctors></div>
                <p className="field__hint">Only a doctor who is present, not on leave and working today (until their last working block ends) can be chosen. This is checked again when you register.</p>
                <p className="field__error" data-error-for="doctorId"></p>
              </div>
            </div>

            <div className="divider"></div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="ew-mobile">Patient mobile <span className="req">*</span></label>
                <div className="input-wrap"><span className="input-affix">+91</span><input className="input" id="ew-mobile" name="mobile" type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" required /></div>
                <p className="field__hint" data-ew-patient-hint>If this number is already on file, the patient is found automatically.</p>
                <p className="field__error" data-error-for="patient.mobile"></p>
              </div>
              <div className="field">
                <label htmlFor="ew-name">Patient name <span className="req">*</span></label>
                <input className="input" id="ew-name" name="name" maxLength={80} placeholder="Full name" required />
                <p className="field__error" data-error-for="patient.name"></p>
              </div>
              <div className="field">
                <label htmlFor="ew-gender">Gender</label>
                <select className="select" id="ew-gender" name="gender">
                  <option value="">Not given</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
                <p className="field__error" data-error-for="patient.gender"></p>
              </div>
              <div className="field">
                <label>Triage priority</label>
                <div className="input ew-readonly">Awaiting triage <small className="text-muted">· assessed by the doctor</small></div>
                <p className="field__hint">Only the doctor sets the clinical priority.</p>
              </div>
              <div className="field field--full">
                <label htmlFor="ew-reason">Emergency reason <span className="req">*</span></label>
                <textarea className="input" id="ew-reason" name="emergencyReason" rows={2} maxLength={300} placeholder="What happened, in a few words (3 to 300 characters)" style={{ height: 'auto', paddingTop: 8 }} required></textarea>
                <p className="field__error" data-error-for="emergencyReason"></p>
              </div>
            </div>

            {/* The number is already on file under another name: the same person, or someone sharing the phone? */}
            <div className="alert alert--info" hidden data-ew-conflict style={{ marginTop: 16, alignItems: 'flex-start' }}>
              <Icon name="info" />
              <div style={{ flex: 1 }}>
                <p data-ew-conflict-text style={{ margin: 0 }}></p>
                <div className="action-group" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn--primary btn--sm" data-ew-same></button>
                  <button type="button" className="btn btn--ghost btn--sm" data-ew-different></button>
                </div>
              </div>
            </div>
          </div>

          {/* Shown after a successful registration, in place of the form. */}
          <div className="modal__body" hidden data-ew-result>
            <div className="alert alert--info" style={{ marginBottom: 16 }}><Icon name="check" /><span data-ew-message></span></div>
            <div className="alert alert--warning" hidden data-ew-r-warning style={{ marginBottom: 16, alignItems: 'flex-start' }}><Icon name="alert" /><span></span></div>
            <div className="ew-token" aria-live="polite">
              <small>Emergency token</small>
              <strong data-ew-token></strong>
            </div>
            <dl className="ew-details">
              <div><dt>Patient</dt><dd data-ew-r-patient></dd></div>
              <div><dt>Doctor</dt><dd data-ew-r-doctor></dd></div>
              <div><dt>Registered</dt><dd data-ew-r-time></dd></div>
              <div><dt>Status</dt><dd data-ew-r-status></dd></div>
              <div><dt>Reason</dt><dd data-ew-r-reason></dd></div>
            </dl>
          </div>

          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" data-modal-close data-ew-cancel>Cancel</button>
            <button type="button" className="btn btn--ghost" hidden data-ew-another>Register another</button>
            <button type="submit" className="btn btn--danger" data-ew-submit><Icon name="alert" /><span>Register Emergency Patient</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
