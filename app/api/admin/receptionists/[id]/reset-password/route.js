import { adapt } from '../../../../../../lib/adaptExpress';
import receptionists from '../../../../../../controllers/admin/receptionistsController';

export const POST = adapt(receptionists.resetPassword, 'receptionists.manage');
