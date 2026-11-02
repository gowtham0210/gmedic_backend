import { adapt } from '../../../../../lib/adaptExpress';
import receptionists from '../../../../../controllers/admin/receptionistsController';

export const PUT = adapt(receptionists.update, 'receptionists.manage');
