import { patientRoute } from '../../../../lib/patientApi';
import booking from '../../../../services/patient/booking';

export const GET = patientRoute(async ({ me }) => ({ items: await booking.appointments(me) }));
