import { adapt } from '../../../../../lib/adaptExpress';
import booking from '../../../../../controllers/receptionBookingController';

export const GET = adapt(booking.walkInSeats, { scope: 'receptionist' });
export const PUT = adapt(booking.setWalkInSeats, { scope: 'receptionist' });
