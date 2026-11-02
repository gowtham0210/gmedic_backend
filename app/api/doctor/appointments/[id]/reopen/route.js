import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/doctor/appointmentsController';

export const POST = adapt(appointments.reopen, { scope: 'doctor' });
