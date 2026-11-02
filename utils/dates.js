// Dates are stored as local "YYYY-MM-DD" strings and times as "HH:mm" (24h).

const pad = (n) => String(n).padStart(2, '0');

function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayISO() {
  return toISODate(new Date());
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const d = parseISODate(value);
  return !Number.isNaN(d.getTime()) && toISODate(d) === value;
}

// The calendar day (YYYY-MM-DD) of a moment in a time zone: a stored UTC "YYYY-MM-DD HH:MM:SS" string, a Date, or now.
// (Used for "today at the hospital" wherever a time zone matters.)
function dateInZone(value, timezone = 'Asia/Kolkata') {
  let when = value === undefined ? new Date() : value;
  if (typeof when === 'string') when = new Date(`${when.replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(when) ? '' : 'Z'}`);
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(when); }
  catch { return when.toISOString().slice(0, 10); }
}

function nowTimeHHmm() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The wall-clock time (HH:MM) now in a time zone.
function timeInZone(timezone = 'Asia/Kolkata') {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); }
  catch { return nowTimeHHmm(); }
}

module.exports = { pad, toISODate, todayISO, startOfToday, addDays, parseISODate, isISODate, nowTimeHHmm, dateInZone, timeInZone };
