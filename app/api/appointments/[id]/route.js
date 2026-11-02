import { adapt } from '../../../../lib/adaptExpress';
import appointmentController from '../../../../controllers/appointmentController';
import booking from '../../../../controllers/receptionBookingController';

export const GET = adapt(appointmentController.get, { scope: 'receptionist' });
export const PATCH = adapt(booking.updateDetails, { scope: 'receptionist' });
