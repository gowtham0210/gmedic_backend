import { patientRoute } from '../../../../../lib/patientApi';
import auth from '../../../../../services/patient/auth';

export const POST = patientRoute(async ({ body }) => auth.requestOtp(body.phone), { signedIn: false });
