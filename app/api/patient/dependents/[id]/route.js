import { patientRoute } from '../../../../../lib/patientApi';
import account from '../../../../../services/patient/account';

export const PUT = patientRoute(async ({ me, params, body }) => account.updateDependent(me.user, params.id, body));
export const DELETE = patientRoute(async ({ me, params }) => account.removeDependent(me.user, params.id));
