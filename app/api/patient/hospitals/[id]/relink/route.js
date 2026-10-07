import { patientRoute } from '../../../../../../lib/patientApi';
import catalog from '../../../../../../services/patient/catalog';

export const POST = patientRoute(async ({ me, params }) => catalog.relinkHospital(me, params.id));
