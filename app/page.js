import { redirect } from 'next/navigation';
import { getSessionUser } from '../lib/session';

const DASHBOARD_BY_ROLE = { RECEPTIONIST: '/dashboard', DOCTOR: '/doctor/dashboard', SUPER_ADMIN: '/admin/dashboard', FINANCE: '/admin/dashboard', SUPPORT: '/admin/dashboard', OPERATIONS: '/admin/dashboard' };

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? DASHBOARD_BY_ROLE[user.role] || '/login' : '/login');
}
