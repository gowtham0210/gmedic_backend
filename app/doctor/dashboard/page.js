import DashboardView from '../../../components/doctor/DashboardView';
import { requireDoctor } from '../../../lib/rbac';
import Icon from '../../../components/Icon';

export const metadata = { title: 'Doctor Dashboard · Gmedic' };
export const dynamic = 'force-dynamic';

export default async function DoctorDashboardPage() {
  const user = await requireDoctor();
  if (!user.doctorId) {
    return (
      <div className="alert alert--error"><Icon name="alert" /><span>This account isn&apos;t linked to a doctor record yet. Contact your hospital&apos;s receptionist or Gmedic admin.</span></div>
    );
  }
  return <DashboardView />;
}
