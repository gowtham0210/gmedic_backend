import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/admin/appointmentsController';

export const POST = adapt(appointments.cancel, 'appointments.manage');
