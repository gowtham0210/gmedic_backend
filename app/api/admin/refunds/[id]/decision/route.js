import { adapt } from '../../../../../../lib/adaptExpress';
import refunds from '../../../../../../controllers/admin/refundsController';

export const POST = adapt(refunds.decide, 'refunds.approve');
