import { adapt } from '../../../../../lib/adaptExpress';
import appointmentController from '../../../../../controllers/appointmentController';

export const PATCH = adapt(appointmentController.updateStatus, { scope: 'receptionist' });
