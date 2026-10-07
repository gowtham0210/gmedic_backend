import { patientRoute } from '../../../../../../lib/patientApi';
import catalog from '../../../../../../services/patient/catalog';

export const GET = patientRoute(async ({ me, params }) => ({ items: await catalog.doctors(me, params.id) }));
