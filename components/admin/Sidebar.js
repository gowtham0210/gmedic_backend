'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '../Icon';

// Every main-menu item lives in a labelled, always-visible group. A group is
// shown if the user can see at least one of its children.
const NAV = [
  {
    group: 'Overview',
    children: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: 'home', perm: 'dashboard.view' },
      { href: '/admin/analytics', label: 'Analytics', icon: 'bar-chart', perm: 'analytics.view' },
    ],
  },
  {
    group: 'Hospital Network',
    children: [
      { href: '/admin/hospitals', label: 'Hospitals', icon: 'hospital', perm: 'hospitals.view' },
      { href: '/admin/doctors', label: 'Doctors', icon: 'stethoscope', perm: 'doctors.view' },
      { href: '/admin/receptionists', label: 'Receptionists', icon: 'users', perm: 'receptionists.view' },
      { href: '/admin/qr', label: 'QR Management', icon: 'qr-code', perm: 'qr.view' },
    ],
  },
  {
    group: 'Operations',
    children: [
      { href: '/admin/appointments', label: 'Appointments', icon: 'calendar', perm: 'appointments.view' },
      { href: '/admin/patients', label: 'Patients', icon: 'user', perm: 'patients.view' },
      { href: '/admin/support', label: 'Support', icon: 'life-buoy', perm: 'support.view_all' },
    ],
  },
  {
    group: 'Finance',
    children: [
      { href: '/admin/payments', label: 'Payments', icon: 'credit-card', perm: 'payments.view' },
      { href: '/admin/refunds', label: 'Refunds', icon: 'refresh', perm: 'refunds.view' },
      { href: '/admin/disputes', label: 'Disputes', icon: 'alert-triangle', perm: 'disputes.view' },
    ],
  },
  {
    group: 'Communications',
    children: [
      { href: '/admin/communications/templates', label: 'Templates', icon: 'message-square', perm: 'communications.templates.view' },
      { href: '/admin/communications/announcements', label: 'Announcements', icon: 'megaphone', perm: 'communications.announcements.view' },
      { href: '/admin/communications/banners', label: 'Banners', icon: 'sparkles', perm: 'communications.banners.view' },
    ],
  },
];

const FOOT_NAV = [
  { href: '/admin/team', label: 'Admin Team', icon: 'shield-check', perm: 'team.view' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings', perm: ['settings.view', 'feature_flags.view', 'app_versions.view'] },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: 'clipboard-list', perm: 'audit_logs.view' },
];

export default function Sidebar({ permissions }) {
  const pathname = usePathname();
  const perms = new Set(permissions || []);
  const canSee = (item) => !item.perm || [].concat(item.perm).some((p) => perms.has(p));
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);

  const renderLink = (item) => (
    <Link key={item.href} href={item.href} className={`nav__link${isActive(item.href) ? ' is-active' : ''}`} aria-current={isActive(item.href) ? 'page' : undefined}>
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

        <nav className="nav">
          {NAV.map((group) => {
            const visible = group.children.filter(canSee);
            if (!visible.length) return null;
            return (
              <div key={group.group} role="group" aria-label={group.group}>
                <p className="nav__group">{group.group}</p>
                <div className="nav__sub">{visible.map(renderLink)}</div>
              </div>
            );
          })}
        </nav>

        {FOOT_NAV.some(canSee) && (
          <nav className="nav nav--footer" aria-label="Platform">
            {FOOT_NAV.filter(canSee).map(renderLink)}
          </nav>
        )}

        <div className="sidebar__resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar (arrow keys to resize, Enter to collapse)" tabIndex={0} title="Drag to resize · double-click to collapse" data-sidebar-resizer></div>
      </aside>
      <div className="sidebar-backdrop" data-sidebar-close></div>
    </>
  );
}
