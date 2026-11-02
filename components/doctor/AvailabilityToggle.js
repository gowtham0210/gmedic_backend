'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

// Today's availability switch in the doctor top bar.
export default function AvailabilityToggle({ initial }) {
  const router = useRouter();
  const [availability, setAvailability] = useState(initial);
  const [saving, setSaving] = useState(false);
  // Follow server updates, e.g. after the Availability page changes the status.
  useEffect(() => { setAvailability(initial); }, [initial]);

  async function toggle() {
    const next = availability === 'present' ? 'absent' : 'present';
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
      router.refresh(); // pages that show the status (dashboard, Availability) are server-rendered
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const present = availability === 'present';
  return (
    <label className="switch switch--topbar" title="Your availability today. Switch off to stop new bookings for the rest of today.">
      <input type="checkbox" checked={present} disabled={saving} onChange={toggle} aria-label="Available today" />
      <span className="switch__track"></span>
      <span className={`switch__label ${present ? 'is-present' : 'is-absent'}`}>{present ? 'Available' : 'Unavailable'}</span>
    </label>
  );
}
