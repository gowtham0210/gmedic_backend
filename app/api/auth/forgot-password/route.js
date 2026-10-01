import { NextResponse } from 'next/server';
import { validate } from '../../../../utils/validate';

// Accounts are managed by an administrator; the response never reveals
// whether the account exists.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { errors, ok } = validate(body, { identifier: { label: 'Email or username', required: true, maxLength: 120 } });
  if (!ok) return NextResponse.json({ error: errors.identifier, fields: errors }, { status: 400 });
  return NextResponse.json({ ok: true, message: 'If an account matches, your administrator has been notified and will contact you to reset your password.' });
}
