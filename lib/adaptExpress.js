// Wraps an existing Express-style (req, res) controller so it can run as a
// Next.js Route Handler. Lets controllers/*.js — already written, with real
// SQL, validation and audit logging — be reused as-is instead of being
// rewritten a second time.
//
//   export const GET = adapt(hospitalsController.list, { permission: 'hospitals.view' });
//   export const GET = adapt(hospitalController.qrSvg, { scope: 'receptionist' });
//
// Supports the subset of Express's `res` that this project's controllers use:
// status/set/type/json/send/attachment — enough for both JSON APIs and the
// binary/SVG QR endpoints.

import { NextResponse } from 'next/server';
import { requireAdminApi, requireReceptionistApi } from './apiGuard';
import { getSessionData, saveSessionData } from './session';
import hospitalModel from '../models/hospitalModel';

export function adapt(controllerFn, opts = {}) {
  // Back-compat: adapt(fn, 'some.permission') from the original admin-only version.
  const { permission, scope = 'admin' } = typeof opts === 'string' ? { permission: opts } : opts;
  return async function handler(req, ctx) {
    const { user, response } = scope === 'receptionist' ? await requireReceptionistApi() : await requireAdminApi(permission);
    if (response) return response;

    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams.entries());
    let body = {};
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.json().catch(() => ({}));
    }
    const params = ctx && ctx.params ? await ctx.params : {};

    // Reused controllers (e.g. notificationController) read/write req.session
    // directly — back it with the real session row so mutations persist.
    const sessionData = scope === 'receptionist' ? (await getSessionData(user.sessionId)) || {} : {};

    const fakeReq = {
      query, body, params, user,
      hospitalId: scope === 'receptionist' ? user.hospitalId : undefined,
      session: sessionData,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local',
      get: (h) => req.headers.get(h),
    };

    let statusCode = 200;
    let payload;
    let isJson = false;
    const headers = {};
    const locals = {};
    if (scope === 'receptionist' && user.hospitalId) {
      locals.hospital = await hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId));
    }
    const fakeRes = {
      locals,
      status(code) { statusCode = code; return this; },
      set(nameOrObj, value) {
        if (typeof nameOrObj === 'object') Object.assign(headers, nameOrObj);
        else headers[nameOrObj] = value;
        return this;
      },
      type(t) {
        const map = { 'image/svg+xml': 'image/svg+xml; charset=utf-8', 'image/png': 'image/png', json: 'application/json' };
        headers['Content-Type'] = map[t] || t;
        return this;
      },
      attachment(filename) {
        headers['Content-Disposition'] = `attachment; filename="${filename}"`;
        return this;
      },
      json(data) { payload = data; isJson = true; },
      send(data) { payload = data; },
    };

    try {
      await controllerFn(fakeReq, fakeRes);
      if (scope === 'receptionist' && user.sessionId) await saveSessionData(user.sessionId, sessionData).catch(() => {});
      if (isJson) return NextResponse.json(payload, { status: statusCode, headers });
      if (Buffer.isBuffer(payload)) return new NextResponse(payload, { status: statusCode, headers });
      return new NextResponse(payload ?? '', { status: statusCode, headers });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      const out = { error: status >= 500 ? 'Something went wrong. Please try again.' : err.message };
      if (err.details) out.fields = err.details;
      return NextResponse.json(out, { status });
    }
  };
}
