import { adapt } from '../../../../lib/adaptExpress';
import notificationController from '../../../../controllers/notificationController';

export const POST = adapt(notificationController.markRead, { scope: 'receptionist' });
