import { adapt } from '../../../../../../lib/adaptExpress';
import receptionists from '../../../../../../controllers/admin/receptionistsController';

export const PATCH = adapt(receptionists.setStatus, 'receptionists.manage');
