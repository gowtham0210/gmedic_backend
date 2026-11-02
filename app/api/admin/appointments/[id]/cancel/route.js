import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/admin/appointmentsController';

export const GET = adapt(appointments.cancelQuote, 'appointments.cancel');
export const POST = adapt(appointments.cancel, 'appointments.cancel');
