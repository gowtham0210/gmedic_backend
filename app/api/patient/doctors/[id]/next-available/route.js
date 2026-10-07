import { patientRoute } from '../../../../../../lib/patientApi';
import catalog from '../../../../../../services/patient/catalog';

export const GET = patientRoute(async ({ me, params, query }) => catalog.nextAvailableDay(me, params.id, query.after));
