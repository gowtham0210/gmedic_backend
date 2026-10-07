import { patientRoute } from '../../../../lib/patientApi';
import account from '../../../../services/patient/account';
import booking from '../../../../services/patient/booking';

export const GET = patientRoute(async ({ me }) => account.userJson(me.user));
export const PUT = patientRoute(async ({ me, body }) => account.updateProfile(me.user, body));
export const DELETE = patientRoute(async ({ me }) => booking.deleteAccount(me));
