import { adapt } from '../../../../../lib/adaptExpress';
import booking from '../../../../../controllers/receptionBookingController';

export const POST = adapt(booking.reschedule, { scope: 'receptionist' });
