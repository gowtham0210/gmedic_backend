import { patientRoute } from '../../../../../../lib/patientApi';
import booking from '../../../../../../services/patient/booking';

export const GET = patientRoute(async ({ me, params }) => booking.rescheduleCheck(me, params.id));
