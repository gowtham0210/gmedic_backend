import { adapt } from '../../../../../../lib/adaptExpress';
import doctors from '../../../../../../controllers/admin/doctorsController';

export const GET = adapt(doctors.statusImpact, 'doctors.view');
export const PATCH = adapt(doctors.setStatus, 'doctors.manage');
