import { adapt } from '../../../../../lib/adaptExpress';
import appointmentController from '../../../../../controllers/appointmentController';

export const GET = adapt(appointmentController.cancelQuote, { scope: 'receptionist' });
export const POST = adapt(appointmentController.cancel, { scope: 'receptionist' });
