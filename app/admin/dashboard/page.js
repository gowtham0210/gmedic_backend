import Icon from '../../../components/Icon';
import DashboardView from '../../../components/admin/DashboardView';
import getDashboardData from '../../../lib/admin/getDashboardData';

export const metadata = { title: 'Super Admin Dashboard · Gmedic' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  let data;
  let dbError = null;
  try {
    data = await getDashboardData();
  } catch (err) {
    dbError = err.message;
  }

  if (dbError) {
    return (
      <div className="alert alert--error" style={{ margin: '20px 0' }}>
        <Icon name="alert" />
        <span>Could not load dashboard data — the database isn&apos;t reachable yet ({dbError}). Run <code>database/setup.sql</code>, then <code>npm run db:setup</code>.</span>
      </div>
    );
  }

  return <DashboardView initial={data} />;
}
