// Doctor portal display preferences (Settings > Preferences). Saved on this device only: they change
// how the doctor's own screens look, nothing anyone else sees. The first render always uses the
// defaults (the server can't read them), then usePrefs() switches to the saved ones after mount.
import { useEffect, useState } from 'react';

const KEY = 'gmedic.doctor.preferences';
export const DEFAULT_PREFS = { defaultStatus: '', timeFormat: '12h' };

export function readPrefs() {
  try { return { ...DEFAULT_PREFS, ...((JSON.parse(localStorage.getItem(KEY)) || {}).preferences || {}) }; } catch { return { ...DEFAULT_PREFS }; }
}

export function savePrefs(preferences) {
  try { localStorage.setItem(KEY, JSON.stringify({ preferences })); } catch { /* storage unavailable: defaults are used */ }
}

let timeFormat = DEFAULT_PREFS.timeFormat;

// "14:30" -> "02:30 PM" (or "14:30" with the 24-hour preference).
export function formatTime(hhmm) {
  if (!hhmm) return '—';
  if (timeFormat === '24h') return String(hhmm).slice(0, 5);
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// The saved preferences, or null until they have been read (after mount).
export function usePrefs() {
  const [prefs, setPrefs] = useState(null);
  useEffect(() => {
    const p = readPrefs();
    timeFormat = p.timeFormat === '24h' ? '24h' : '12h';
    setPrefs(p);
  }, []);
  return prefs;
}
