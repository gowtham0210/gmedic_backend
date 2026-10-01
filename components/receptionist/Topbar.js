import Link from 'next/link';
import Icon from '../Icon';

export default function Topbar({ user, hospital }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" data-sidebar-toggle aria-label="Toggle sidebar" aria-controls="sidebar"><Icon name="menu" /></button>

      <Link href="/hospital" className="hospital-chip" title="Your hospital">
        <Icon name="hospital" />
        <span className="hospital-chip__name">{hospital.name}</span>
        <span className="hospital-chip__id">{hospital.id}</span>
      </Link>

      <div className="global-search" data-global-search>
        <button type="button" className="icon-btn icon-btn--bordered global-search__toggle" aria-label="Search" data-search-toggle><Icon name="search" /></button>
        <div className="global-search__field">
          <Icon name="search" className="icon--sm" />
          <input type="search" placeholder="Search doctors or patients…" aria-label="Search doctors or patients" autoComplete="off" spellCheck="false" data-search-input />
          <kbd aria-hidden="true">/</kbd>
        </div>
        <div className="search-results" role="listbox" hidden data-search-results></div>
      </div>

      <div className="topbar__actions">
        <div className="dropdown" data-dropdown>
          <button type="button" className="icon-btn icon-btn--bordered" aria-label="Notifications" aria-haspopup="true" aria-expanded="false" data-dropdown-toggle data-notif-toggle>
            <Icon name="bell" /><span className="dot-badge" hidden data-notif-count></span>
          </button>
          <div className="dropdown__menu dropdown__menu--wide" role="menu">
            <div className="notif__head">
              <h3>Notifications</h3>
              <button type="button" className="auth__link" data-notif-read>Mark all as read</button>
            </div>
            <div className="notif__list" data-notif-list>
              <div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div>
            </div>
            <Link className="notif__foot" href="/appointments">View all appointments</Link>
          </div>
        </div>

        <span className="topbar__divider" aria-hidden="true"></span>

        <div className="dropdown" data-dropdown>
          <button type="button" className="profile-btn" aria-haspopup="true" aria-expanded="false" data-dropdown-toggle aria-label="Account menu">
            <span className="avatar avatar--teal" data-user-initials>{user.initials}</span>
            <span className="profile-btn__text"><strong data-user-name>{user.name}</strong><small>Receptionist</small></span>
            <Icon name="chevron-down" />
          </button>
          <div className="dropdown__menu" role="menu">
            <div className="dropdown__header">
              <span className="avatar avatar--teal" data-user-initials>{user.initials}</span>
              <div><strong data-user-name>{user.name}</strong><small>{user.email}</small></div>
            </div>
            <Link className="dropdown__item" role="menuitem" href="/settings"><Icon name="user" />My profile</Link>
            <Link className="dropdown__item" role="menuitem" href="/settings#password"><Icon name="lock" />Change password</Link>
            <Link className="dropdown__item" role="menuitem" href="/hospital"><Icon name="hospital" />Hospital information</Link>
            <div className="dropdown__sep"></div>
            <button type="button" className="dropdown__item dropdown__item--danger" role="menuitem" data-logout><Icon name="log-out" />Logout</button>
          </div>
        </div>
      </div>
    </header>
  );
}
