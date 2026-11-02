'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';
import { formatDateTime } from '../../../lib/format';
import { ICON } from '../../../components/doctor/NotificationBell';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=DOCTOR'; throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api('/api/doctor/notifications').then((d) => setItems(d.items)).catch((err) => toast(err.message, 'error')).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openOne(n) {
    if (!n.unread) return;
    setItems((list) => list.map((i) => (i.id === n.id ? { ...i, unread: false } : i)));
    fetch(`/api/doctor/notifications/${encodeURIComponent(n.id)}/read`, { method: 'POST', keepalive: true, credentials: 'same-origin' }).catch(() => {});
  }

  async function markAllRead() {
    try {
      await api('/api/doctor/notifications/read', { method: 'POST' });
      setItems((list) => list.map((i) => ({ ...i, unread: false })));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>New bookings, cancellations and updates for your own appointments.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--ghost" onClick={markAllRead}><Icon name="check" />Mark all as read</button>
        </div>
      </div>

      <article className="card card--flush">
        <div className="table-wrap" style={{ padding: 8 }}>
          {loading && <div className="skeleton skeleton--row"></div>}
          {!loading && items.length === 0 && (
            <div className="empty" style={{ padding: 40 }}><div className="empty__icon"><Icon name="bell" /></div><h3>You&apos;re all caught up</h3><p>New bookings and updates will show up here.</p></div>
          )}
          {items.map((n) => (
            <a key={n.id} href={n.link || '#'} onClick={() => openOne(n)} className={`notif__item${n.unread ? ' is-unread' : ''}`} style={{ display: 'flex', gap: 14, padding: '14px 10px', borderBottom: '1px solid var(--border-2)' }}>
              <span className={`notif__icon ${ICON[n.eventKey]?.[1] || 'tone-teal'}`}><Icon name={ICON[n.eventKey]?.[0] || 'bell'} /></span>
              <span style={{ flex: 1 }}>
                <p><strong>{n.title}</strong> — {n.body}</p>
                <small className="text-muted">{n.at ? formatDateTime(n.at) : ''}</small>
              </span>
            </a>
          ))}
        </div>
      </article>
    </>
  );
}
