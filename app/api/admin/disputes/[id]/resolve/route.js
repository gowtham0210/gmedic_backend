import { adapt } from '../../../../../../lib/adaptExpress';
import disputes from '../../../../../../controllers/admin/disputesController';

export const POST = adapt(disputes.resolve, 'disputes.manage');
