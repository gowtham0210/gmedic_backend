import Icon from '../Icon';

// One-time credentials for a new or reset portal account. Shown once; never stored in the page.
export default function CredentialsModal({ creds, onClose }) {
  if (!creds) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="creds-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <div className="modal__head">
          <div className="modal__icon tone-green"><Icon name="check-circle" /></div>
          <div><h2 id="creds-title">Credentials issued</h2><p>Share these securely. The temporary password must be changed at first sign-in and is not shown again.</p></div>
        </div>
        <div className="modal__body">
          <dl className="kv">
            <div><dt>Sign in with</dt><dd className="mono">{creds.login}</dd></div>
            <div><dt>Temporary password</dt><dd className="mono">{creds.tempPassword}</dd></div>
          </dl>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
