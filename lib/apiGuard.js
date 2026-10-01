// Route Handler guards. Unlike lib/rbac.js (which redirects, for pages), these
// return { user, response }. When `response` is set, return it immediately —
// access was denied. Otherwise `user` is the authenticated user. Usage:
//   const { user, response } = await requireAdminApi('hospitals.view');
//   if (response) return response;

import { NextResponse } from 'next/server';
import { getSessionUser } from './session';
import { ADMIN_ROLES, roleHas } from '../config/permissions';

export async function requireAdminApi(permission) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return { user: null, response: NextResponse.json({ error: 'Your session has ended. Please log in again.' }, { status: 401 }) };
  }
  if (permission && !roleHas(user.role, permission)) {
    return { user, response: NextResponse.json({ error: "Your role doesn't have permission to do this." }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function requireReceptionistApi() {
  const user = await getSessionUser();
  if (!user || user.role !== 'RECEPTIONIST') {
    return { user: null, response: NextResponse.json({ error: 'Your session has ended. Please log in again.' }, { status: 401 }) };
  }
  return { user, response: null };
}
