import { patientRoute } from '../../../../../../lib/patientApi';
import catalog from '../../../../../../services/patient/catalog';

export const GET = patientRoute(async ({ me, params, query }) => ({ items: await catalog.slots(me, params.id, query.date) }));
