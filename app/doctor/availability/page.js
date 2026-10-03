import Icon from '../../../components/Icon';
import AvailabilityStatus from '../../../components/doctor/AvailabilityStatus';
import { requireDoctor } from '../../../lib/rbac';
import doctorModel from '../../../models/doctorModel';

export const metadata = { title: 'Availability · Gmedic' };
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const user = await requireDoctor();
  if (!user.doctorId) {
    return <div className="alert alert--error"><Icon name="alert" /><span>This account isn&apos;t linked to a doctor record yet.</span></div>;
  }
  const doctor = await doctorModel.findById(user.hospitalId, user.doctorId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Doctor Availability</h1>
          <p>Patients booking through the Gmedic app see this status instantly.</p>
        </div>
      </div>

      <AvailabilityStatus initial={doctor.availability} updatedAt={doctor.availabilityUpdatedAt} />
    </>
  );
}
