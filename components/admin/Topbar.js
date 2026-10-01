import Link from 'next/link';
import Icon from '../Icon';

function initials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export default function Topbar({ user }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" data-sidebar-toggle aria-label="Toggle sidebar" aria-controls="sidebar"><Icon name="menu" /></button>

      <div className="hospital-chip" style={{ pointerEvents: 'none' }}>
        <Icon name="shield" />
        <span className="hospital-chip__name">Gmedic Platform</span>
        <span className="hospital-chip__id">{user.role.replace('_', ' ')}</span>
      </div>

      <div className="topbar__actions" style={{ marginLeft: 'auto' }}>
        <div className="dropdown" data-dropdown>
          <button type="button" className="profile-btn" aria-haspopup="true" aria-expanded="false" data-dropdown-toggle aria-label="Account menu">
            <span className="avatar avatar--teal" data-user-initials>{initials(user.name)}</span>
            <span className="profile-btn__text"><strong data-user-name>{user.name}</strong><small>{user.role.replace('_', ' ')}</small></span>
            <Icon name="chevron-down" />
          </button>
          <div className="dropdown__menu" role="menu">
            <div className="dropdown__header">
              <span className="avatar avatar--teal" data-user-initials>{initials(user.name)}</span>
              <div><strong data-user-name>{user.name}</strong><small>{user.email}</small></div>
            </div>
            <Link className="dropdown__item" role="menuitem" href="/admin/settings"><Icon name="user" />My profile</Link>
            <Link className="dropdown__item" role="menuitem" href="/admin/settings#password"><Icon name="lock" />Change password</Link>
            <div className="dropdown__sep"></div>
            <button type="button" className="dropdown__item dropdown__item--danger" role="menuitem" data-logout><Icon name="log-out" />Logout</button>
          </div>
        </div>
      </div>
    </header>
  );
}
