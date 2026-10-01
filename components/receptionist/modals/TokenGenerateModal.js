import Icon from '../../Icon';

export default function TokenGenerateModal() {
  return (
    <div className="modal" id="token-generate-modal" role="dialog" aria-modal="true" aria-labelledby="tg-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--lg">
        <form id="token-generate-form" noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="ticket" /></div>
            <div>
              <h2 id="tg-title">Generate Token</h2>
              <p>Assign the next queue token to a patient&apos;s appointment.</p>
            </div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>

          <div className="modal__body">
            <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div className="field">
                <label htmlFor="tg-date">Appointment date</label>
                <input className="input" id="tg-date" name="date" type="date" required />
              </div>
              <div className="field">
                <label htmlFor="tg-doctor">Doctor</label>
                <select className="select" id="tg-doctor" name="doctorId"><option value="">All doctors</option></select>
              </div>
              <div className="field field--full">
                <label htmlFor="tg-q">Find patient</label>
                <div className="input-wrap"><Icon name="search" /><input className="input" id="tg-q" name="q" type="search" placeholder="Patient name or appointment ID" autoComplete="off" /></div>
              </div>
            </div>

            <fieldset className="field" style={{ gap: 10 }}>
              <legend>Appointment <span className="req">*</span></legend>
              <div className="elig-list" data-eligible-list>
                <div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div>
              </div>
              <p className="field__error" data-error-for="appointmentId"></p>
            </fieldset>
          </div>

          <div className="modal__foot modal__foot--split">
            <span className="token-preview">Next token: <span className="token-pill" data-next-code>–</span></span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
              <button type="submit" className="btn btn--primary" data-generate-submit><Icon name="check" /><span>Assign Token</span></button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
