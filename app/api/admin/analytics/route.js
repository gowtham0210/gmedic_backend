import { NextResponse } from 'next/server';
import { requireAdminApi } from '../../../../lib/apiGuard';
import getDashboardData from '../../../../lib/admin/getDashboardData';

// Same data as /api/admin/dashboard (bookings/revenue/QR-funnel/hospital
// growth trends) gated behind the separate analytics.view permission, so
// FINANCE-role admins can see trends without the full operational dashboard.
export async function GET() {
  const { response } = await requireAdminApi('analytics.view');
  if (response) return response;
  return NextResponse.json(await getDashboardData());
}
