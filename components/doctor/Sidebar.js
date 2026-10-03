'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '../Icon';

const NAV = [
  { href: '/doctor/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/doctor/appointments', label: 'Appointments', icon: 'calendar' },
  { href: '/doctor/queue', label: "Today's Queue", icon: 'activity' },
  { href: '/doctor/patients', label: 'Patients', icon: 'users' },
  { href: '/doctor/schedule', label: 'Schedule', icon: 'clock' },
  { href: '/doctor/availability', label: 'Availability', icon: 'toggle-left' },
  { href: '/doctor/profile', label: 'My Profile', icon: 'user' },
  { href: '/doctor/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/doctor/settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);

  const renderLink = (item) => (
    <Link key={item.href} href={item.href} className={`nav__link${isActive(item.href) ? ' is-active' : ''}`} title={item.label} aria-current={isActive(item.href) ? 'page' : undefined}>
      <Icon name={item.icon} />
      <span className="nav__text">{item.label}</span>
    </Link>
  );

  return (
    <>
      <aside className="sidebar" id="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand">
          <Link href="/doctor/dashboard" className="sidebar__logo" aria-label="Gmedic doctor portal">
            <img className="sidebar__logo-full" src="/images/gmedic-logo-light.png" alt="Gmedic — Book · Consult · Care" width="190" height="56" />
            <img className="sidebar__logo-mark" src="/images/gmedic-mark.png" alt="Gmedic" width="40" height="40" />
          </Link>
          <button type="button" className="icon-btn sidebar__close" data-sidebar-close aria-label="Close menu"><Icon name="x" /></button>
        </div>

        <nav className="nav">{NAV.map(renderLink)}</nav>

        <p className="sidebar__tagline">Gmedic Doctor Portal</p>

        <nav className="nav nav--footer" aria-label="Account">
          <Link href="/doctor/support" className={`nav__link${isActive('/doctor/support') ? ' is-active' : ''}`} title="Help & Support" aria-current={isActive('/doctor/support') ? 'page' : undefined}>
            <Icon name="life-buoy" /><span className="nav__text">Help &amp; Support</span>
          </Link>
          <button type="button" className="nav__link" title="Logout" data-logout><Icon name="log-out" /><span className="nav__text">Logout</span></button>
        </nav>

        <div className="sidebar__resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar (arrow keys to resize, Enter to collapse)" tabIndex={0} title="Drag to resize · double-click to collapse" data-sidebar-resizer></div>
      </aside>
      <div className="sidebar-backdrop" data-sidebar-close></div>
    </>
  );
}
