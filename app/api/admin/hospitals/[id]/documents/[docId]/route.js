import { adapt } from '../../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../../controllers/admin/hospitalsController';

// GET returns the stored file itself (inline); PATCH verifies or rejects it.
export const GET = adapt(hospitals.downloadDocument, 'kyc.view');
export const PATCH = adapt(hospitals.reviewDocument, 'kyc.manage');
