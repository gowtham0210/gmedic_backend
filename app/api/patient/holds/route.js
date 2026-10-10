import { patientRoute } from '../../../../lib/patientApi';
import booking from '../../../../services/patient/booking';

export const POST = patientRoute(async ({ me, body }) => [201, await booking.holdSlot(me, body.slotId, body.patientId)]);
