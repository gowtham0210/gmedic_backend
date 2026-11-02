import { adapt } from '../../../../lib/adaptExpress';
import disputes from '../../../../controllers/admin/disputesController';

export const GET = adapt(disputes.list, 'disputes.view');
export const POST = adapt(disputes.create, 'disputes.manage');
