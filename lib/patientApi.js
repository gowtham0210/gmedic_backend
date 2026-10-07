// Route wrapper for the patient-app API (/api/patient/...).
//
//   export const GET = patientRoute(async ({ me, params, query, body }) => ({ ...json }));
//   return [201, json] to answer with another status code.
//
// Authentication is a bearer token (see services/patient/auth.js), not the portals' cookie session.
// Errors are always { error: "<message for the patient>", code: "<STABLE_CODE>" } so the app can map them.

import { NextResponse } from 'next/server';
import auth from '../services/patient/auth';
import { ApiError } from '../services/patient/common';

export function patientRoute(handler, { signedIn = true } = {}) {
  return async function route(req, ctx) {
    try {
      const params = ctx && ctx.params ? await ctx.params : {};
      const query = Object.fromEntries(new URL(req.url).searchParams.entries());
      const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
      const body = hasBody ? await req.json().catch(() => ({})) : {};
      const me = signedIn ? await auth.authenticate(req) : null;
      const out = await handler({ req, me, params, query, body });
      const [status, payload] = Array.isArray(out) ? out : [200, out];
      return NextResponse.json(payload === undefined ? { ok: true } : payload, { status });
    } catch (err) {
      if (err instanceof ApiError) {
        const out = { error: err.message, code: err.code };
        if (err.details) out.fields = err.details;
        return NextResponse.json(out, { status: err.status });
      }
      if (err && err.status && err.status < 500) return NextResponse.json({ error: err.message, code: 'ERROR' }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' }, { status: 500 });
    }
  };
}
