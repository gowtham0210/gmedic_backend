import { adapt } from '../../../../lib/adaptExpress';
import notifications from '../../../../controllers/doctor/notificationsController';

export const GET = adapt(notifications.list, { scope: 'doctor' });
