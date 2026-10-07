import { patientRoute } from '../../../../../../lib/patientApi';
import catalog from '../../../../../../services/patient/catalog';

export const GET = patientRoute(async ({ me, params }) => catalog.quote(me, params.id));
