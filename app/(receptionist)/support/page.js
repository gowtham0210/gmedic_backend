import SupportCenter from '../../../components/shared/SupportCenter';
import { requireReceptionist } from '../../../lib/rbac';

export const metadata = { title: 'Support · Gmedic' };

export default async function ReceptionistSupportPage() {
  await requireReceptionist();
  return <SupportCenter apiBase="/api/support" loginRole="RECEPTIONIST" />;
}
