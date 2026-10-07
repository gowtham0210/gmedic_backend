import { NextResponse } from 'next/server';
import crypto from 'crypto';
import events, { EVENT_KEYS } from '../../../../services/appointmentEvents';

// Server-to-server endpoint for events that originate in another system. The Gmedic patient
// app does not need it: its bookings go through /api/patient/... and fire these events directly.
// The caller authenticates with the shared INTERNAL_EVENT_KEY (header "x-internal-key").
//
//   POST /api/internal/events   { "eventKey": "APPOINTMENT_CONFIRMED", "appointmentId": "APT10555" }
//
// Doctor and receptionist recipients are delivered; a patient gets an in-app notification when
// the appointment belongs to a patient-app account, otherwise it is logged as unavailable.

function keyMatches(given) {
  const expected = process.env.INTERNAL_EVENT_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!process.env.INTERNAL_EVENT_KEY) {
    return NextResponse.json({ error: 'Internal events are not configured (set INTERNAL_EVENT_KEY).' }, { status: 503 });
  }
  if (!keyMatches(req.headers.get('x-internal-key'))) {
    return NextResponse.json({ error: 'Invalid internal key.' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!EVENT_KEYS.includes(body.eventKey)) return NextResponse.json({ error: `Unsupported eventKey. Use one of: ${EVENT_KEYS.join(', ')}.` }, { status: 400 });
  const result = await events.fire(body.eventKey, body.appointmentId);
  if (!result) return NextResponse.json({ error: 'Invalid appointment ID.' }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
