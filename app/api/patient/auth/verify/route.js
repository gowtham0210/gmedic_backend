import { patientRoute } from '../../../../../lib/patientApi';
import account from '../../../../../services/patient/account';
import auth from '../../../../../services/patient/auth';

export const POST = patientRoute(async ({ body }) => {
  const { token, user } = await auth.verifyOtp(body.phone, body.code);
  return { token, user: await account.userJson(user) };
}, { signedIn: false });
