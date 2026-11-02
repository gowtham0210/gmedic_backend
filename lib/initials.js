// "Dr. Arun Srinivasan" -> "AS" (the "Dr." prefix is skipped).
export function initials(name) {
  return String(name || '').replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}
