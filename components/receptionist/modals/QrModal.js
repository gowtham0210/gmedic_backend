import Icon from '../../Icon';

export default function QrModal({ hospitalName }) {
  return (
    <div className="modal" id="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--poster">
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="qr-code" /></div>
          <div>
            <h2 id="qr-title">Hospital QR Code</h2>
            <p>Display this at reception. Patients scan it in the Gmedic app to add {hospitalName}.</p>
          </div>
          <button type="button" className="icon-btn" data-modal-close aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body qr-modal">
          <img className="qr-poster" alt={`Gmedic QR poster for ${hospitalName}`} width="1060" height="1500" data-qr-poster />
        </div>
        <div className="modal__foot modal__foot--split">
          <a className="btn btn--ghost btn--sm" href="/api/hospital/qr.png?download=1" download><Icon name="qr-code" />QR code only</a>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--ghost" data-qr-print><Icon name="printer" />Print</button>
            <button type="button" className="btn btn--primary" data-download-poster><Icon name="download" /><span>Download QR</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
