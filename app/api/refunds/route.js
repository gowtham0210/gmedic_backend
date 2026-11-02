import { adapt } from '../../../lib/adaptExpress';
import refunds from '../../../controllers/admin/refundsController';

// Reuses the Super Admin refund controller: it's the same business rule either way (paid appointment,
// maker-checker threshold), and both functions scope to req.hospitalId when it is set (receptionist scope).
// GET: this hospital's refund requests with their status, and the reason for a rejection.
export const GET = adapt(refunds.list, { scope: 'receptionist' });
export const POST = adapt(refunds.create, { scope: 'receptionist' });
