'use client';

import { useEffect, useState } from 'react';
import Icon from '../Icon';

// An announcement banner (Doctor and Receptionist portals) the person can close. The dismissal is
// remembered on this device only, per announcement, so a new announcement still shows.
const KEY = 'gmedic.dismissedAnnouncements';

function readDismissed() {
  try { return JSON.parse(window.localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export default function DismissibleNotice({ id, title, message }) {
  // Hidden until we've read the stored list, so a closed announcement never flashes back in.
  const [state, setState] = useState('checking');
  useEffect(() => { setState(readDismissed().includes(id) ? 'closed' : 'open'); }, [id]);

  function close() {
    setState('closed');
    try { window.localStorage.setItem(KEY, JSON.stringify([...new Set([...readDismissed(), id])].slice(-50))); } catch { /* storage blocked: closes for this visit only */ }
  }

  if (state !== 'open') return null;
  return (
    <div className="alert alert--info" style={{ alignItems: 'center', background: 'var(--amber-50)', borderColor: 'var(--amber-700)', color: 'var(--amber-700)' }}>
      <Icon name="megaphone" />
      <span style={{ flex: 1 }}><strong>{title}</strong> — {message}</span>
      <button type="button" className="icon-btn icon-btn--sm" style={{ color: 'inherit', flexShrink: 0 }} aria-label={`Dismiss announcement: ${title}`} title="Dismiss" onClick={close}><Icon name="x" /></button>
    </div>
  );
}
