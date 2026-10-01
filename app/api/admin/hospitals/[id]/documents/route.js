import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

// Upload isn't wired here yet (multer needs a real Express req stream) — use
// the legacy server for document upload/review in the meantime.
export const GET = adapt(hospitals.listDocuments, 'kyc.view');
