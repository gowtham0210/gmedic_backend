import { adapt } from '../../../../../../../lib/adaptExpress';
import doctors from '../../../../../../../controllers/admin/doctorsController';

export const PATCH = adapt(doctors.setLoginStatus, 'doctors.manage');
