import { adapt } from '../../../../lib/adaptExpress';
import refunds from '../../../../controllers/admin/refundsController';

export const GET = adapt(refunds.list, 'refunds.view');
export const POST = adapt(refunds.create, 'refunds.manage');
