import { patientRoute } from '../../../../lib/patientApi';
import catalog from '../../../../services/patient/catalog';

export const GET = patientRoute(async ({ me }) => ({ items: await catalog.linkedHospitals(me) }));
