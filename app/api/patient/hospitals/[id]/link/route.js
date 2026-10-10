import { patientRoute } from '../../../../../../lib/patientApi';
import catalog from '../../../../../../services/patient/catalog';

export const POST = patientRoute(async ({ me, params, body }) => catalog.linkHospital(me, params.id, body.qrKeyId));
export const DELETE = patientRoute(async ({ me, params }) => catalog.unlinkHospital(me, params.id));
