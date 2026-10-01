import { adapt } from '../../../../../../lib/adaptExpress';
import settlements from '../../../../../../controllers/admin/settlementsController';

export const POST = adapt(settlements.markPaid, 'settlements.manage');
