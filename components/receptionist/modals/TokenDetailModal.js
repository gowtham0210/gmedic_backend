import Icon from '../../Icon';

export default function TokenDetailModal() {
  return (
    <div className="modal" id="token-detail-modal" role="dialog" aria-modal="true" aria-labelledby="td-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel">
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="ticket" /></div>
          <div>
            <h2 id="td-title">Token details</h2>
            <p data-token-sub>Queue token for a patient visit</p>
          </div>
          <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body" data-token-body>
          <div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div>
        </div>
        <div className="modal__foot modal__foot--split">
          <button type="button" className="btn btn--ghost" style={{ color: 'var(--red-600)' }} data-token-cancel><Icon name="x" /><span>Cancel token</span></button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="td-status" className="field__label nowrap">Status</label>
            <select className="select" id="td-status" style={{ height: 40, minWidth: 150 }} data-token-status>
              <option value="waiting">Waiting</option>
              <option value="called">Called</option>
              <option value="completed">Completed</option>
            </select>
            <button type="button" className="btn btn--primary" data-token-save disabled><Icon name="check" /><span>Update</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
