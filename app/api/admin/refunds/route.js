import { adapt } from '../../../../lib/adaptExpress';
import refunds from '../../../../controllers/admin/refundsController';

// Admins review refunds (approve/reject) and can raise one themselves, for example to clean up after an
// offboarded hospital. Receptionists request refunds for their own hospital through /api/refunds.
export const GET = adapt(refunds.list, 'refunds.view');
export const POST = adapt(refunds.create, 'refunds.manage');
