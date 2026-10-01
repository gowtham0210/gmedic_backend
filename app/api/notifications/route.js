import { adapt } from '../../../lib/adaptExpress';
import notificationController from '../../../controllers/notificationController';

export const GET = adapt(notificationController.list, { scope: 'receptionist' });
