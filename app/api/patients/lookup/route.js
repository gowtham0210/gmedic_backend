import { adapt } from '../../../../lib/adaptExpress';
import booking from '../../../../controllers/receptionBookingController';

export const GET = adapt(booking.lookup, { scope: 'receptionist' });
