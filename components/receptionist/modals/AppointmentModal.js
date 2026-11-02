import Icon from '../../Icon';

export default function AppointmentModal() {
  return (
    <>
      <div className="modal" id="appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appt-title" hidden>
        <div className="modal__backdrop" data-modal-close></div>
        <div className="modal__panel">
          <div className="modal__head">
            <div className="modal__icon tone-blue"><Icon name="calendar-check" /></div>
            <div>
              <h2 id="appt-title">Appointment details</h2>
              <p data-appt-sub>Booked through the Gmedic app</p>
            </div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body" data-appt-body>
            <div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div>
          </div>
          <div className="modal__foot modal__foot--split" style={{ flexWrap: 'wrap' }}>
            {/* Up to five actions: they wrap onto a second line instead of running past the panel's edge. */}
            <div className="action-group" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--ghost" style={{ color: 'var(--red-600)' }} data-appt-cancel hidden><Icon name="calendar-x" /><span>Cancel appointment</span></button>
              <button type="button" className="btn btn--ghost" data-appt-collect hidden><Icon name="wallet" /><span>Collect payment</span></button>
              <button type="button" className="btn btn--ghost" data-appt-reschedule hidden><Icon name="calendar" /><span>Reschedule</span></button>
              <button type="button" className="btn btn--ghost" data-appt-noshow hidden><Icon name="user-x" /><span>No-show</span></button>
              <button type="button" className="btn btn--ghost" data-appt-edit hidden><Icon name="pencil" /><span>Edit details</span></button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 'auto' }} data-appt-status-group>
              <label htmlFor="appt-status" className="field__label nowrap">Status</label>
              {/* The options are only the moves the server accepts (nextStatuses). Cancelling has its own button and dialog (refund, token, notice). */}
              <select className="select" id="appt-status" style={{ height: 40, minWidth: 140 }} data-appt-status></select>
              <button type="button" className="btn btn--primary" data-appt-save disabled><Icon name="check" /><span>Update</span></button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal" id="appointment-reschedule-modal" role="dialog" aria-modal="true" aria-labelledby="appt-resched-title" hidden>
        <div className="modal__backdrop" data-modal-close></div>
        <div className="modal__panel">
          <form id="appointment-reschedule-form" noValidate>
            <div className="modal__head">
              <div className="modal__icon tone-blue"><Icon name="calendar" /></div>
              <div>
                <h2 id="appt-resched-title">Reschedule appointment</h2>
                <p data-resched-sub></p>
              </div>
              <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="modal__body">
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
              <div className="field" style={{ maxWidth: 240 }}>
                <label htmlFor="resched-date">New date <span className="req">*</span></label>
                <input className="input" id="resched-date" name="date" type="date" required />
                <p className="field__error" data-error-for="date"></p>
              </div>
              <fieldset className="field field--full slot-picker" style={{ marginTop: 14 }}>
                <legend>Slot with the same doctor <span className="req">*</span></legend>
                <div className="slot-picker__meta"><span data-resched-summary className="text-muted">Choose a date to see free slots.</span></div>
                <div className="slot-grid" role="radiogroup" aria-label="Slots" data-resched-grid></div>
                <p className="field__error" data-error-for="time"></p>
              </fieldset>
              <p className="note"><Icon name="info" /><span>The payment stays with the appointment. The patient gets a new token for the new day and the patient and doctor are told.</span></p>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" data-modal-close>Back</button>
              <button type="submit" className="btn btn--primary" data-resched-submit disabled><Icon name="check" /><span>Move Appointment</span></button>
            </div>
          </form>
        </div>
      </div>

      <div className="modal" id="appointment-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="appt-cancel-title" hidden>
        <div className="modal__backdrop" data-modal-close></div>
        <div className="modal__panel modal__panel--sm">
          <form id="appointment-cancel-form" noValidate>
            <div className="modal__head">
              <div className="modal__icon tone-red"><Icon name="calendar-x" /></div>
              <div>
                <h2 id="appt-cancel-title">Cancel appointment?</h2>
                <p data-cancel-sub></p>
              </div>
              <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="modal__body">
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
              <div data-cancel-quote><div className="skeleton skeleton--row"></div></div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="appt-cancel-reason" className="field__label">Reason *</label>
                <textarea className="textarea" id="appt-cancel-reason" name="reason" rows={3} maxLength={300} placeholder="Enter the reason for cancelling this appointment…" required></textarea>
                <p className="field__error" data-error-for="reason"></p>
              </div>
              <p className="note"><Icon name="info" /><span>The patient’s queue token is withdrawn, and the patient, doctor and front desk are notified.</span></p>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" data-modal-close>Back</button>
              <button type="submit" className="btn btn--danger" data-cancel-submit disabled><Icon name="calendar-x" /><span>Cancel Appointment</span></button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
