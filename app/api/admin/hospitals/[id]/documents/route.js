import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

export const GET = adapt(hospitals.listDocuments, 'kyc.view');
// multipart/form-data: docType + file (PDF, PNG or JPEG, up to 8 MB); parsed by lib/adaptExpress.js
export const POST = adapt(hospitals.uploadDocument, 'kyc.manage');
