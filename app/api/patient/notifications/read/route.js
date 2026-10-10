import { patientRoute } from '../../../../../lib/patientApi';
import notifications from '../../../../../services/patient/notifications';

export const POST = patientRoute(async ({ me }) => notifications.markRead(me.user));
