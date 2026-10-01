import Icon from '../../Icon';

export default function DoctorFormModal({ hospitalName, specializations }) {
  return (
    <div className="modal" id="doctor-modal" role="dialog" aria-modal="true" aria-labelledby="doctor-modal-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel">
        <form id="doctor-form" noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-teal" data-doctor-modal-icon><Icon name="user-plus" /></div>
            <div>
              <h2 id="doctor-modal-title">Add Doctor</h2>
              <p data-doctor-modal-sub>Add a doctor to {hospitalName}.</p>
            </div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>

          <div className="modal__body">
            <div className="alert alert--error" hidden data-form-alert><Icon name="alert" /><span></span></div>
            <div className="form-grid" style={{ marginTop: 0 }}>
              <div className="field field--full">
                <label htmlFor="doctor-name">Doctor name <span className="req">*</span></label>
                <div className="input-wrap">
                  <span className="input-affix">Dr.</span>
                  <input className="input" id="doctor-name" name="name" type="text" required minLength={3} maxLength={60} placeholder="e.g. Kavita Menon" autoComplete="off" />
                </div>
                <p className="field__error" data-error-for="name"></p>
              </div>

              <div className="field">
                <label htmlFor="doctor-spec">Specialist <span className="req">*</span></label>
                <select className="select" id="doctor-spec" name="specialization" required defaultValue="">
                  <option value="">Select specialisation</option>
                  {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <p className="field__error" data-error-for="specialization"></p>
              </div>

              <div className="field">
                <label htmlFor="doctor-fee">Appointment fee <span className="req">*</span></label>
                <div className="input-wrap">
                  <span className="input-affix">₹</span>
                  <input className="input" id="doctor-fee" name="fee" type="number" inputMode="numeric" required min={50} max={20000} step={1} placeholder="500" />
                </div>
                <p className="field__error" data-error-for="fee"></p>
              </div>

              <fieldset className="field field--full">
                <legend>Availability <span className="req">*</span></legend>
                <div className="segmented">
                  <label className="seg-option seg-option--present">
                    <input type="radio" name="availability" value="present" defaultChecked />
                    <span className="seg-option__dot"></span>
                    <span><strong>Present</strong><small>Available for appointments today</small></span>
                  </label>
                  <label className="seg-option seg-option--absent">
                    <input type="radio" name="availability" value="absent" />
                    <span className="seg-option__dot"></span>
                    <span><strong>Absent / On Leave</strong><small>Not available today</small></span>
                  </label>
                </div>
                <p className="field__error" data-error-for="availability"></p>
              </fieldset>
            </div>
          </div>

          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
            <button type="submit" className="btn btn--primary" data-doctor-submit><Icon name="check" /><span>Save Doctor</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
