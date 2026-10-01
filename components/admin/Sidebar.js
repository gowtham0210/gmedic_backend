'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '../Icon';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: 'home', perm: 'dashboard.view' },
  { href: '/admin/hospitals', label: 'Hospitals', icon: 'hospital', perm: 'hospitals.view' },
  { href: '/admin/doctors', label: 'Doctors', icon: 'stethoscope', perm: 'doctors.view' },
  { href: '/admin/receptionists', label: 'Receptionists', icon: 'users', perm: 'receptionists.view' },
  { href: '/admin/qr', label: 'QR Management', icon: 'qr-code', perm: 'qr.view' },
  { href: '/admin/appointments', label: 'Appointments', icon: 'calendar', perm: 'appointments.view' },
  { href: '/admin/patients', label: 'Patients', icon: 'user', perm: 'patients.view' },
  { href: '/admin/payments', label: 'Payments', icon: 'credit-card', perm: 'payments.view' },
  { href: '/admin/refunds', label: 'Refunds', icon: 'refresh', perm: 'refunds.view' },
  { href: '/admin/settlements', label: 'Settlements', icon: 'wallet', perm: 'settlements.view' },
  { href: '/admin/support', label: 'Support', icon: 'life-buoy', perm: 'support.view' },
  { href: '/admin/disputes', label: 'Disputes', icon: 'alert-triangle', perm: 'disputes.view' },
  { href: '/admin/communications', label: 'Communications', icon: 'message-square', perm: 'communications.view' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'bar-chart', perm: 'analytics.view' },
];

const FOOT_NAV = [
  { href: '/admin/settings', label: 'Settings', icon: 'settings', perm: 'settings.view' },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: 'clipboard-list', perm: 'audit_logs.view' },
];

export default function Sidebar({ permissions }) {
  const pathname = usePathname();
  const perms = new Set(permissions || []);
  const canSee = (item) => !item.perm || perms.has(item.perm);
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
          <Link href="/admin/dashboard" className="sidebar__logo" aria-label="Gmedic admin dashboard">
            <img className="sidebar__logo-full" src="/images/gmedic-logo-light.png" alt="Gmedic — Book · Consult · Care" width="190" height="56" />
            <img className="sidebar__logo-mark" src="/images/gmedic-mark.png" alt="Gmedic" width="40" height="40" />
          </Link>
          <button type="button" className="icon-btn sidebar__close" data-sidebar-close aria-label="Close menu"><Icon name="x" /></button>
        </div>

        <nav className="nav">{NAV.filter(canSee).map(renderLink)}</nav>

        <p className="sidebar__tagline">Gmedic Platform<br />Super Admin Console</p>

        <nav className="nav nav--footer" aria-label="Platform">
          {FOOT_NAV.filter(canSee).map(renderLink)}
          <button type="button" className="nav__link" title="Logout" data-logout><Icon name="log-out" /><span className="nav__text">Logout</span></button>
        </nav>

        <div className="sidebar__resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar (arrow keys to resize, Enter to collapse)" tabIndex={0} title="Drag to resize · double-click to collapse" data-sidebar-resizer></div>
      </aside>
      <div className="sidebar-backdrop" data-sidebar-close></div>
    </>
  );
}
