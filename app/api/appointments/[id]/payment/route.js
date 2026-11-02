import { adapt } from '../../../../../lib/adaptExpress';
import booking from '../../../../../controllers/receptionBookingController';

export const POST = adapt(booking.collectPayment, { scope: 'receptionist' });
