import { patientRoute } from '../../../../../../lib/patientApi';
import booking from '../../../../../../services/patient/booking';

export const POST = patientRoute(async ({ me, params, body }) => booking.reschedule(me, params.id, body.slotId));
