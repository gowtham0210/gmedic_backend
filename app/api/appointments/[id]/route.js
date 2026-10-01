import { adapt } from '../../../../lib/adaptExpress';
import appointmentController from '../../../../controllers/appointmentController';

export const GET = adapt(appointmentController.get, { scope: 'receptionist' });
