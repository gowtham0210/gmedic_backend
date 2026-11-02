import { adapt } from '../../../../../lib/adaptExpress';
import hospitals from '../../../../../controllers/admin/hospitalsController';

export const PATCH = adapt(hospitals.updateDepartment, 'hospitals.manage');
