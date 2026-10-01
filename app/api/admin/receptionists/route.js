import { adapt } from '../../../../lib/adaptExpress';
import receptionists from '../../../../controllers/admin/receptionistsController';

export const GET = adapt(receptionists.list, 'receptionists.view');
export const POST = adapt(receptionists.create, 'receptionists.manage');
