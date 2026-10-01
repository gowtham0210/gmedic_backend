'use client';

import Icon from './Icon';

export default function LogoutModal() {
  async function handleLogout(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      window.location.assign(data.redirect || '/login?loggedOut=1');
    } catch {
      window.location.assign('/login?loggedOut=1');
    }
  }

  return (
    <div className="modal" id="logout-modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" hidden>
      <div className="modal__backdrop" data-modal-close></div>
      <div className="modal__panel modal__panel--sm">
        <div className="modal__head">
          <div className="modal__icon tone-red"><Icon name="log-out" /></div>
          <div>
            <h2 id="logout-title">Log out of Gmedic?</h2>
            <p>You&apos;ll need to sign in again to access this portal.</p>
          </div>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" data-modal-close>Cancel</button>
          <form onSubmit={handleLogout}>
            <button type="submit" className="btn btn--danger"><Icon name="log-out" />Logout</button>
          </form>
        </div>
      </div>
    </div>
  );
}
