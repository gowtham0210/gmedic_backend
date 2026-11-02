'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '../Icon';
import NotificationBell from './NotificationBell';
import DoctorAvatar from '../DoctorAvatar';
import AvailabilityToggle from './AvailabilityToggle';

export default function Topbar({ user, doctor, hospital }) {
  const router = useRouter();
  const [q, setQ] = useState('');

  function onSearch(e) {
    e.preventDefault();
    if (q.trim()) router.push(`/doctor/patients?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" data-sidebar-toggle aria-label="Toggle sidebar" aria-controls="sidebar"><Icon name="menu" /></button>

      <Link href="/doctor/profile" className="hospital-chip" title="Your hospital">
        <Icon name="hospital" />
        <span className="hospital-chip__name">{hospital.name}</span>
      </Link>

      <form className="global-search" onSubmit={onSearch} role="search">
        <div className="global-search__field">
          <Icon name="search" className="icon--sm" />
          <input type="search" placeholder="Search patient name or appointment ID…" aria-label="Search patients" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </form>

      <div className="topbar__actions">
        <AvailabilityToggle initial={doctor.availability} />

        <NotificationBell />

        <span className="topbar__divider" aria-hidden="true"></span>

        <div className="dropdown" data-dropdown>
          <button type="button" className="profile-btn" aria-haspopup="true" aria-expanded="false" data-dropdown-toggle aria-label="Account menu">
            <DoctorAvatar name={user.name} photoUrl={doctor.photoUrl} />
            <span className="profile-btn__text"><strong data-user-name>{user.name}</strong><small>{doctor.specialization}</small></span>
            <Icon name="chevron-down" />
          </button>
          <div className="dropdown__menu" role="menu">
            <div className="dropdown__header">
              <DoctorAvatar name={user.name} photoUrl={doctor.photoUrl} />
              <div><strong data-user-name>{user.name}</strong><small>{user.email}</small></div>
            </div>
            <Link className="dropdown__item" role="menuitem" href="/doctor/profile"><Icon name="user" />My Profile</Link>
            <Link className="dropdown__item" role="menuitem" href="/doctor/settings"><Icon name="settings" />Settings</Link>
            <Link className="dropdown__item" role="menuitem" href="/doctor/support"><Icon name="life-buoy" />Help &amp; Support</Link>
            <div className="dropdown__sep"></div>
            <button type="button" className="dropdown__item dropdown__item--danger" role="menuitem" data-logout><Icon name="log-out" />Logout</button>
          </div>
        </div>
      </div>
    </header>
  );
}
