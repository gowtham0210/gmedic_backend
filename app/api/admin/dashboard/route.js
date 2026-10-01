import { NextResponse } from 'next/server';
import { requireAdminApi } from '../../../../lib/apiGuard';
import getDashboardData from '../../../../lib/admin/getDashboardData';

export async function GET() {
  const { response } = await requireAdminApi('dashboard.view');
  if (response) return response;
  return NextResponse.json(await getDashboardData());
}
