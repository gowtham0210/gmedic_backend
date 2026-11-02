import Icon from '../../Icon';

// Records the fee a patient pays at the front desk (cash, UPI or card), then shows a printable receipt.
// Driven by public/js/collect-payment.js (G.collectPayment); fires `appointments:changed` and `payments:changed`.
export default function CollectPaymentModal() {
  return (
    <div className="modal" id="collect-payment-modal" role="dialog" aria-modal="true" aria-labelledby="collect-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--sm">
        <form id="collect-payment-form" noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-green"><Icon name="wallet" /></div>
            <div>
              <h2 id="collect-title">Collect payment</h2>
              <p data-collect-sub></p>
            </div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
            <dl className="kv" style={{ marginBottom: 14 }}><div className="kv--full"><dt>Amount to collect</dt><dd style={{ fontSize: 20, fontWeight: 700 }} data-collect-amount></dd></div></dl>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="collect-method">How did the patient pay? <span className="req">*</span></label>
              <select className="select" id="collect-method" name="method">
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
              </select>
              <p className="field__error" data-error-for="method"></p>
            </div>
            <div className="field" data-collect-ref-field hidden>
              <label htmlFor="collect-reference" data-collect-ref-label>Reference <span className="req">*</span></label>
              <input className="input mono" id="collect-reference" name="reference" maxLength={60} autoComplete="off" />
              <p className="field__error" data-error-for="reference"></p>
            </div>
            <p className="note"><Icon name="info" /><span>The consultation fee is paid to the hospital, including for Gmedic app bookings (their booking token is separate and non-refundable). It is recorded for the hospital&apos;s records; if the patient is later refunded, the hospital returns it directly.</span></p>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
            <button type="submit" className="btn btn--primary" data-collect-submit><Icon name="check" /><span>Record Payment</span></button>
          </div>
        </form>

        <div data-collect-receipt hidden>
          <div className="modal__head">
            <div className="modal__icon tone-green"><Icon name="check-circle" /></div>
            <div><h2>Payment recorded</h2><p data-receipt-sub></p></div>
            <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body" data-receipt-body></div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" data-modal-close>Done</button>
            <button type="button" className="btn btn--primary" data-receipt-print><Icon name="printer" /><span>Print receipt</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
