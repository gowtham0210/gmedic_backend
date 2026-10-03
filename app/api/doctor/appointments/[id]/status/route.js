import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/doctor/appointmentsController';

export const PATCH = adapt(appointments.updateStatus, { scope: 'doctor' });
