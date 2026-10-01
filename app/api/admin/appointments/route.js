import { adapt } from '../../../../lib/adaptExpress';
import appointments from '../../../../controllers/admin/appointmentsController';

export const GET = adapt(appointments.list, 'appointments.view');
