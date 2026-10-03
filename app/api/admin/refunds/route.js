import { adapt } from '../../../../lib/adaptExpress';
import refunds from '../../../../controllers/admin/refundsController';

// Super Admin only reviews refunds (approve/reject) — requesting one is the
// receptionist's job (see /api/refunds), since they're the ones who deal
// with the patient and the paid transaction directly.
export const GET = adapt(refunds.list, 'refunds.view');
