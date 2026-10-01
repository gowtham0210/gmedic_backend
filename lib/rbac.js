// Server-side route guards for layouts/pages. Called at the top of every
// protected layout, so every nested page is covered — this is the real
// enforcement point, not the sidebar links (which just hide, they don't
// protect anything).

import { redirect } from 'next/navigation';
import { getSessionUser } from './session';
import { ADMIN_ROLES, roleHas } from '../config/permissions';

export async function requireAdmin(currentPath, permission) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    redirect(`/login?role=SUPER_ADMIN${currentPath ? `&next=${encodeURIComponent(currentPath)}` : ''}`);
  }
  if (permission && !roleHas(user.role, permission)) {
    redirect('/admin/dashboard?denied=1');
  }
  return user;
}

export async function requireReceptionist(currentPath) {
  const user = await getSessionUser();
  if (!user || user.role !== 'RECEPTIONIST') {
    redirect(`/login?role=RECEPTIONIST${currentPath ? `&next=${encodeURIComponent(currentPath)}` : ''}`);
  }
  return user;
}

export async function requireDoctor(currentPath) {
  const user = await getSessionUser();
  if (!user || user.role !== 'DOCTOR') {
    redirect(`/login?role=DOCTOR${currentPath ? `&next=${encodeURIComponent(currentPath)}` : ''}`);
  }
  return user;
}

export async function redirectIfAuthenticated() {
  const user = await getSessionUser();
  if (!user) return;
  const byRole = { SUPER_ADMIN: '/admin/dashboard', FINANCE: '/admin/dashboard', SUPPORT: '/admin/dashboard', OPERATIONS: '/admin/dashboard', RECEPTIONIST: '/dashboard', DOCTOR: '/doctor/dashboard' };
  redirect(byRole[user.role] || '/login');
}
