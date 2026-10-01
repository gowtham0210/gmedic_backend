import Icon from '../../Icon';

export default function AvailabilityModal() {
  return (
    <div className="modal" id="availability-modal" role="dialog" aria-modal="true" aria-labelledby="availability-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--lg">
        <div className="modal__head">
          <div className="modal__icon tone-green"><Icon name="user-check" /></div>
          <div>
            <h2 id="availability-title">Update Availability</h2>
            <p>Mark doctors present or absent / on leave for today.</p>
          </div>
          <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body">
          <div className="avail-summary" data-avail-summary></div>
          <div className="input-wrap" style={{ marginBottom: 12 }}>
            <Icon name="search" />
            <input className="input" type="search" placeholder="Search doctor or specialisation" aria-label="Filter doctors" data-avail-filter />
          </div>
          <div className="avail-list" data-avail-list>
            <div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div>
          </div>
        </div>
        <div className="modal__foot modal__foot--split">
          <span className="text-muted" data-avail-changes>No changes yet</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
            <button type="button" className="btn btn--primary" data-avail-save disabled><Icon name="check" /><span>Save changes</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
