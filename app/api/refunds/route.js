import { adapt } from '../../../lib/adaptExpress';
import refunds from '../../../controllers/admin/refundsController';

// Reuses the Super Admin refund controller's create() — it's the same
// business rule (paid appointment, maker-checker threshold) either way, and
// create() already scopes to req.hospitalId when it's set (receptionist scope).
export const POST = adapt(refunds.create, { scope: 'receptionist' });
