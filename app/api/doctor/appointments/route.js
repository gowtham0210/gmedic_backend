import { adapt } from '../../../../lib/adaptExpress';
import appointments from '../../../../controllers/doctor/appointmentsController';

export const GET = adapt(appointments.list, { scope: 'doctor' });
