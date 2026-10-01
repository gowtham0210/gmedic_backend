import Script from 'next/script';
import Icon from '../../components/Icon';
import LogoutModal from '../../components/LogoutModal';
import { requireDoctor } from '../../lib/rbac';
import userModel from '../../models/userModel';
import hospitalModel from '../../models/hospitalModel';

// The doctor portal has one page for now, so it gets a simple top bar rather
// than the full resizable sidebar the admin/receptionist portals use.
export default async function DoctorLayout({ children }) {
  const user = await requireDoctor();
  const publicUser = userModel.toPublic(user);
  const hospital = await hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId));

  return (
    <div className="main" style={{ marginLeft: 0 }}>
      <header className="topbar">
        <a href="/doctor/dashboard" className="sidebar__logo" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/images/gmedic-logo.png" alt="Gmedic" width="140" height="41" />
        </a>
        <div className="hospital-chip" style={{ pointerEvents: 'none' }}>
          <Icon name="hospital" />
          <span className="hospital-chip__name">{hospital.name}</span>
        </div>
        <div className="topbar__actions" style={{ marginLeft: 'auto' }}>
          <div className="dropdown" data-dropdown>
            <button type="button" className="profile-btn" aria-haspopup="true" aria-expanded="false" data-dropdown-toggle aria-label="Account menu">
              <span className="avatar avatar--teal" data-user-initials>{publicUser.initials}</span>
              <span className="profile-btn__text"><strong data-user-name>{publicUser.name}</strong><small>Doctor</small></span>
              <Icon name="chevron-down" />
            </button>
            <div className="dropdown__menu" role="menu">
              <div className="dropdown__header">
                <span className="avatar avatar--teal" data-user-initials>{publicUser.initials}</span>
                <div><strong data-user-name>{publicUser.name}</strong><small>{publicUser.email}</small></div>
              </div>
              <div className="dropdown__sep"></div>
              <button type="button" className="dropdown__item dropdown__item--danger" role="menuitem" data-logout><Icon name="log-out" />Logout</button>
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>{children}</main>

      <LogoutModal />
      <div className="toasts" id="toasts" aria-live="polite" aria-atomic="false"></div>
      <Script src="/js/layout.js" strategy="afterInteractive" />
    </div>
  );
}
