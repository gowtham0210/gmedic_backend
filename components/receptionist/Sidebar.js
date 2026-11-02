'use client';

import { usePathname } from 'next/navigation';
import Icon from '../Icon';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/hospital', label: 'Hospital Information', icon: 'hospital' },
  { href: '/doctors', label: 'Doctors', icon: 'user' },
  { href: '/appointments', label: 'Appointments', icon: 'calendar' },
  { href: '/tokens', label: 'Tokens', icon: 'ticket' },
  { href: '/payments', label: 'Payments', icon: 'credit-card' },
  { href: '/support', label: 'Support', icon: 'life-buoy' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);

  // Plain <a>, not next/link: receptionist pages are driven by /js/pages/*.js,
  // which next/script runs only once per src. A client-side navigation back to a
  // page would leave it stuck on its loading skeleton, so every portal link does a
  // full page load. Same for Topbar and PortalNotices.
  const renderLink = (item) => (
    <a key={item.href} href={item.href} className={`nav__link${isActive(item.href) ? ' is-active' : ''}`} aria-current={isActive(item.href) ? 'page' : undefined}>
      <Icon name={item.icon} />
      <span className="nav__text">{item.label}</span>
    </a>
  );

  return (
    <>
      <aside className="sidebar" id="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand">
          <a href="/dashboard" className="sidebar__logo" aria-label="Gmedic dashboard">
            <img className="sidebar__logo-full" src="/images/gmedic-logo-light.png" alt="Gmedic — Book · Consult · Care" width="190" height="56" />
            <img className="sidebar__logo-mark" src="/images/gmedic-mark.png" alt="Gmedic" width="40" height="40" />
          </a>
          <button type="button" className="icon-btn sidebar__close" data-sidebar-close aria-label="Close menu"><Icon name="x" /></button>
        </div>

        <nav className="nav">{NAV.map(renderLink)}</nav>

        <p className="sidebar__tagline">Better Healthcare<br />for a Healthier Tomorrow</p>

        <nav className="nav nav--footer" aria-label="Account">
          <a href="/settings" className={`nav__link${isActive('/settings') ? ' is-active' : ''}`} aria-current={isActive('/settings') ? 'page' : undefined}>
            <Icon name="settings" /><span className="nav__text">Settings</span>
          </a>
        </nav>

        <div className="sidebar__resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar (arrow keys to resize, Enter to collapse)" tabIndex={0} title="Drag to resize · double-click to collapse" data-sidebar-resizer></div>
      </aside>
      <div className="sidebar-backdrop" data-sidebar-close></div>
    </>
  );
}
