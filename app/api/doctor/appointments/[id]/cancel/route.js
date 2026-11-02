import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/doctor/appointmentsController';

// GET: what cancelling would refund; POST { reason }: cancel through the shared cancel path.
export const GET = adapt(appointments.cancelQuote, { scope: 'doctor' });
export const POST = adapt(appointments.cancel, { scope: 'doctor' });
