import Icon from '../../Icon';

export default function AppointmentModal() {
  return (
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
        <div className="modal__foot modal__foot--split">
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <label htmlFor="appt-status" className="field__label nowrap">Status</label>
            <select className="select" id="appt-status" style={{ height: 40, minWidth: 160 }} data-appt-status>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn--ghost" data-modal-close>Close</button>
            <button type="button" className="btn btn--primary" data-appt-save disabled><Icon name="check" /><span>Update</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
