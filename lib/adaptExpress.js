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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import config from '../config';
import { requireAdminApi, requireReceptionistApi, requireDoctorApi } from './apiGuard';
import { getSessionData, saveSessionData } from './session';
import hospitalModel from '../models/hospitalModel';

// multipart/form-data: text fields become req.body; the first file part is validated
// (PDF / PNG / JPEG, max 8 MB, same rules as middleware/upload.js) and saved to
// config.uploadDir, then exposed as req.file ({ originalname, filename, mimetype, size }).
const UPLOAD_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_UPLOAD = 8 * 1024 * 1024;
async function readMultipart(req) {
  const form = await req.formData().catch(() => null);
  const body = {};
  let file;
  if (!form) return { body, file };
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') { body[key] = value; continue; }
    if (file || !value.size || value.size > MAX_UPLOAD || !UPLOAD_TYPES.has(value.type)) continue;
    fs.mkdirSync(config.uploadDir, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(value.name || '').slice(0, 10)}`;
    fs.writeFileSync(path.join(config.uploadDir, filename), Buffer.from(await value.arrayBuffer()));
    file = { originalname: value.name, filename, mimetype: value.type, size: value.size };
  }
  return { body, file };
}

export function adapt(controllerFn, opts = {}) {
  // Back-compat: adapt(fn, 'some.permission') from the original admin-only version.
  const { permission, scope = 'admin' } = typeof opts === 'string' ? { permission: opts } : opts;
  return async function handler(req, ctx) {
    const { user, response } = scope === 'receptionist' ? await requireReceptionistApi()
      : scope === 'doctor' ? await requireDoctorApi()
      : await requireAdminApi(permission);
    if (response) return response;

    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams.entries());
    let body = {};
    let file;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if ((req.headers.get('content-type') || '').startsWith('multipart/form-data')) ({ body, file } = await readMultipart(req));
      else {
        const text = await req.text();
        if (text.trim()) {
          try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid JSON in the request body.' }, { status: 400 }); }
        }
      }
    }
    const params = ctx && ctx.params ? await ctx.params : {};

    // Reused controllers (e.g. notificationController) read/write req.session
    // directly — back it with the real session row so mutations persist.
    const sessionData = (scope === 'receptionist' || scope === 'doctor') ? (await getSessionData(user.sessionId)) || {} : {};

    const fakeReq = {
      query, body, params, user, file,
      hospitalId: (scope === 'receptionist' || scope === 'doctor') ? user.hospitalId : undefined,
      doctorId: scope === 'doctor' ? user.doctorId : undefined,
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
      if ((scope === 'receptionist' || scope === 'doctor') && user.sessionId) await saveSessionData(user.sessionId, sessionData).catch(() => {});
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
