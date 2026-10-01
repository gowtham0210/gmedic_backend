import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/admin/appointmentsController';

export const POST = adapt(appointments.reschedule, 'appointments.manage');
