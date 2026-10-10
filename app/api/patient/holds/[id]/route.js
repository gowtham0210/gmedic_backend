import { patientRoute } from '../../../../../lib/patientApi';
import booking from '../../../../../services/patient/booking';

export const DELETE = patientRoute(async ({ me, params }) => booking.releaseHold(me, params.id));
