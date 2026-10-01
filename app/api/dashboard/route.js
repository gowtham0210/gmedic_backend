import { adapt } from '../../../lib/adaptExpress';
import dashboardController from '../../../controllers/dashboardController';

export const GET = adapt(dashboardController.summary, { scope: 'receptionist' });
