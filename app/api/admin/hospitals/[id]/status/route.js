import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

export const PATCH = adapt(hospitals.setStatus, 'hospitals.manage');
