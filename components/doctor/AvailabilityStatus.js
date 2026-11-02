'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '../Icon';
import { formatDateTime } from '../../lib/format';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

export default function AvailabilityStatus({ initial, updatedAt }) {
  const router = useRouter();
  const [availability, setAvailability] = useState(initial);
  const [saving, setSaving] = useState(false);
  // Follow server updates, e.g. after the top-bar switch changes the status.
  useEffect(() => { setAvailability(initial); }, [initial]);
  // Formatted client-side only (after mount): the time depends on the viewer's
  // time zone, which can differ between the Node server and the browser, so
  // rendering it during SSR could cause a hydration mismatch.
  const [updatedLabel, setUpdatedLabel] = useState('');
  useEffect(() => { if (updatedAt) setUpdatedLabel(formatDateTime(updatedAt)); }, [updatedAt]);

  async function setStatus(next) {
    if (next === availability) return;
    setSaving(true);
    try {
      const res = await fetch('/api/doctor/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: next }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update availability.');
      setAvailability(next);
      toast(data.message, 'success');
      router.refresh(); // the top bar's switch takes the server-rendered status
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const present = availability === 'present';

  return (
    <article className="card" style={{ maxWidth: 560 }}>
      <div className="card__head"><h2 className="card__title"><Icon name="toggle-left" />Current Status</h2></div>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <span className={`badge badge--${present ? 'confirmed' : 'cancelled'}`} style={{ fontSize: 15, padding: '8px 18px' }}>
          {present ? 'Available' : 'Unavailable'}
        </span>
        {updatedLabel && <p className="text-muted" style={{ marginTop: 10, fontSize: 12.5 }}>Last updated {updatedLabel}</p>}
      </div>
      <div className="action-group" style={{ justifyContent: 'center', gap: 14 }}>
        <button type="button" className={`btn btn--lg ${present ? 'btn--primary' : 'btn--outline'}`} disabled={saving} onClick={() => setStatus('present')}>
          <Icon name="check-circle" /><span>Available</span>
        </button>
        <button type="button" className={`btn btn--lg ${!present ? 'btn--danger' : 'btn--outline'}`} disabled={saving} onClick={() => setStatus('absent')}>
          <Icon name="x" /><span>Unavailable</span>
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 20, textAlign: 'center' }}>
        Unavailable applies to today only: patients and the front desk can&apos;t book you for the rest of today, and it resets tomorrow. Existing appointments are not cancelled. For several days away, add a leave under Schedule.
      </p>
    </article>
  );
}
