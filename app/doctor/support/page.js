import SupportCenter from '../../../components/shared/SupportCenter';

export const metadata = { title: 'Help & Support · Gmedic' };

export default function DoctorSupportPage() {
  return <SupportCenter apiBase="/api/doctor/support" loginRole="DOCTOR" />;
}
