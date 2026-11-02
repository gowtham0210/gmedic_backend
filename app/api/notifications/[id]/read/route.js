import { adapt } from '../../../../../lib/adaptExpress';
import notificationController from '../../../../../controllers/notificationController';

export const POST = adapt(notificationController.markOneRead, { scope: 'receptionist' });
