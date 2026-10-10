import { patientRoute } from '../../../../lib/patientApi';
import notifications from '../../../../services/patient/notifications';

export const GET = patientRoute(async ({ me }) => notifications.list(me.user));
