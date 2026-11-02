import { adapt } from '../../../../../../lib/adaptExpress';
import doctors from '../../../../../../controllers/admin/doctorsController';

export const POST = adapt(doctors.inviteLogin, 'doctors.manage');
