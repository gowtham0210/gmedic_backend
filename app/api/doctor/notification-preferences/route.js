import { adapt } from '../../../../lib/adaptExpress';
import prefs from '../../../../controllers/doctor/notificationPrefsController';

export const GET = adapt(prefs.get, { scope: 'doctor' });
export const PUT = adapt(prefs.update, { scope: 'doctor' });
