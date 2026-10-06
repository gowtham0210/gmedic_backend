import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../../lib/session';
import doctorModel from '../../../../models/doctorModel';
import notifications from '../../../../services/notificationService';

// A doctor can only ever update their own availability (user.doctorId),
// never another doctor's — unlike the receptionist/admin endpoints, there's
// no :id in the URL to trick.
export async function PATCH(req) {
  const user = await getSessionUser();
  if (!user || user.role !== 'DOCTOR' || !user.doctorId) {
    return NextResponse.json({ error: 'Your session has ended. Please log in again.' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!doctorModel.AVAILABILITY.includes(body.availability)) {
    return NextResponse.json({ error: 'Choose Present or Absent / On Leave.' }, { status: 400 });
  }
  const doctor = await doctorModel.update(user.hospitalId, user.doctorId, { availability: body.availability });
  const label = doctor.availability === 'present' ? 'Present' : 'Absent / On Leave';
  await notifications.trigger('DOCTOR_AVAILABILITY_UPDATED', await notifications.hospitalUsers(user.hospitalId, 'RECEPTIONIST'), {
    doctor_name: doctor.name.replace(/^Dr\.?\s*/i, ''), availability: doctor.availability === 'present' ? 'available' : 'unavailable', hospital_name: '',
  }, { link: '/doctors' });
  return NextResponse.json({ ok: true, message: `You are marked as ${label}.`, doctor });
}
