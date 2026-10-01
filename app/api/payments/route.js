import { adapt } from '../../../lib/adaptExpress';
import paymentController from '../../../controllers/paymentController';

export const GET = adapt(paymentController.list, { scope: 'receptionist' });
