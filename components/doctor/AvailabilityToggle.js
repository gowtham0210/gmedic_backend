'use client';

import { useState } from 'react';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

export default function AvailabilityToggle({ initial }) {
  const [availability, setAvailability] = useState(initial);
  const [saving, setSaving] = useState(false);

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
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const present = availability === 'present';
  return (
    <label className="switch">
      <input type="checkbox" checked={present} disabled={saving} onChange={toggle} aria-label="Present today" />
      <span className="switch__track"></span>
      <span className={`switch__label ${present ? 'is-present' : 'is-absent'}`}>{present ? 'Present' : 'Absent / On Leave'}</span>
    </label>
  );
}
