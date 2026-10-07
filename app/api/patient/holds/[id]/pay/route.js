import { patientRoute } from '../../../../../../lib/patientApi';
import booking from '../../../../../../services/patient/booking';

export const POST = patientRoute(async ({ me, params, body, req }) => [201, await booking.pay(me, params.id, { ...body, simulate: req.headers.get('x-simulate-payment') })]);
