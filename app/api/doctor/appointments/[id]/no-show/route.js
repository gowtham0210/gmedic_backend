import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/doctor/appointmentsController';

export const POST = adapt(appointments.markNoShow, { scope: 'doctor' });
export const DELETE = adapt(appointments.undoNoShow, { scope: 'doctor' });
