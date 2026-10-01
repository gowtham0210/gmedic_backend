import { adapt } from '../../../../lib/adaptExpress';
import settlements from '../../../../controllers/admin/settlementsController';

export const GET = adapt(settlements.list, 'settlements.view');
export const POST = adapt(settlements.generate, 'settlements.manage');
