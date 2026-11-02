import { adapt } from '../../../../../../../lib/adaptExpress';
import doctors from '../../../../../../../controllers/admin/doctorsController';

export const POST = adapt(doctors.resetLoginPassword, 'doctors.manage');
