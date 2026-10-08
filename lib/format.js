// Date/time display for the React pages — mirrors G.date / G.time in
// public/js/core.js so every portal shows the same thing (design-system §9):
//   formatDate('2026-10-14')            -> "14 Oct 2026"
//   formatDate('2026-10-07T09:00:00Z')  -> "7 Oct 2026"   (viewer's local day)
//   formatDateTime(iso)                 -> "7 Oct 2026, 02:30 PM"
//   formatShortDate('2026-10-14')       -> "14 Oct"       (chart axes)
//   formatTime('14:30')                 -> "02:30 PM"
// Never call toLocaleString() without a locale: its output depends on the
// viewer's browser (7/10 vs 10/7) and is ambiguous.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' is a calendar day, not an instant: build it in local time so it
// never shifts a day across time zones. Anything else is parsed as an instant.
function toDate(value) {
  if (value instanceof Date) return value;
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
}

function valid(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value) {
  const d = valid(value);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—';
}

export function formatShortDate(value) {
  const d = valid(value);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '—';
}

export function formatTime(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${pad(((h + 11) % 12) + 1)}:${pad(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatDateTime(value) {
  const d = valid(value);
  return d ? `${formatDate(d)}, ${formatTime(`${d.getHours()}:${d.getMinutes()}`)}` : '—';
}
