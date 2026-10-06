import { adapt } from '../../../../../lib/adaptExpress';
import notifications from '../../../../../controllers/doctor/notificationsController';

export const POST = adapt(notifications.markRead, { scope: 'doctor' });
