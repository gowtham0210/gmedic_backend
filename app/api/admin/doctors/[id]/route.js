import { adapt } from '../../../../../lib/adaptExpress';
import doctors from '../../../../../controllers/admin/doctorsController';

export const GET = adapt(doctors.get, 'doctors.view');
export const PUT = adapt(doctors.update, 'doctors.manage');
