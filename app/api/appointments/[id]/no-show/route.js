import { adapt } from '../../../../../lib/adaptExpress';
import booking from '../../../../../controllers/receptionBookingController';

export const POST = adapt(booking.markNoShow, { scope: 'receptionist' });
export const DELETE = adapt(booking.undoNoShow, { scope: 'receptionist' });
