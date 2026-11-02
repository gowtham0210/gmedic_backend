import { adapt } from '../../../lib/adaptExpress';
import appointmentController from '../../../controllers/appointmentController';
import booking from '../../../controllers/receptionBookingController';

export const GET = adapt(appointmentController.list, { scope: 'receptionist' });
export const POST = adapt(booking.book, { scope: 'receptionist' });
