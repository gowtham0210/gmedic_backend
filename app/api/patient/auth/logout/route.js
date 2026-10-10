import { patientRoute } from '../../../../../lib/patientApi';
import auth from '../../../../../services/patient/auth';

export const POST = patientRoute(async ({ me }) => auth.logout(me));
