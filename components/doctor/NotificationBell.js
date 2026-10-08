'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon';
import { formatDate, formatDateTime, formatTime } from '../../lib/format';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export default function NotificationBell() {
  const wrapRef = useRef(null);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api('/api/doctor/notifications');
      setItems(data.items);
      setUnread(data.unread);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener('dropdown:open', load);
    return () => el.removeEventListener('dropdown:open', load);
  }, []);

  async function markAllRead() {
    try {
      await api('/api/doctor/notifications/read', { method: 'POST' });
      setUnread(0);
      setItems((list) => list.map((i) => ({ ...i, unread: false })));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="dropdown" data-dropdown ref={wrapRef}>
      <button type="button" className="icon-btn icon-btn--bordered" aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'} aria-haspopup="true" aria-expanded="false" data-dropdown-toggle>
        <Icon name="bell" /><span className="dot-badge" hidden={!unread}>{unread > 9 ? '9+' : unread}</span>
      </button>
      <div className="dropdown__menu dropdown__menu--wide" role="menu">
        <div className="notif__head">
          <h3>Notifications</h3>
          <button type="button" className="auth__link" onClick={markAllRead}>Mark all as read</button>
        </div>
        <div className="notif__list">
          {loading && <><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></>}
          {!loading && items.length === 0 && (
            <div className="empty" style={{ padding: '28px 16px' }}><div className="empty__icon"><Icon name="bell" /></div><p>You&apos;re all caught up.</p></div>
          )}
          {!loading && items.map((n) => (
            <Link key={n.id} className={`notif__item${n.unread ? ' is-unread' : ''}`} href={n.type === 'system' ? (n.link || '/doctor/notifications') : `/doctor/appointments?q=${encodeURIComponent(n.patientName || '')}`}>
              <span className={`notif__icon ${n.type === 'reminder' ? 'tone-blue' : n.type === 'system' ? 'tone-teal' : 'tone-green'}`}><Icon name={n.type === 'reminder' ? 'clock' : n.type === 'system' ? 'bell' : 'calendar-check'} /></span>
              <span>
                <p>{n.type === 'system'
                  ? <><strong>{n.title}</strong> — {n.body}</>
                  : n.type === 'reminder'
                    ? <>Upcoming today: <strong>{n.patientName}</strong> at {n.time}</>
                    : <>New appointment booked: <strong>{n.patientName}</strong> on {formatDate(n.date)} at {formatTime(n.time)}</>}
                </p>
                <small>{n.at ? formatDateTime(n.at) : ''}</small>
              </span>
            </Link>
          ))}
        </div>
        <Link className="notif__foot" href="/doctor/appointments">View all appointments</Link>
      </div>
    </div>
  );
}
