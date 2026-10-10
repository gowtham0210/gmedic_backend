import { patientRoute } from '../../../../lib/patientApi';
import account from '../../../../services/patient/account';

export const GET = patientRoute(async ({ me }) => ({ items: await account.dependents(me.user) }));
export const POST = patientRoute(async ({ me, body }) => [201, await account.addDependent(me.user, body)]);
