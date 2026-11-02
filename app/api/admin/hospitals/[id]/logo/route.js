import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

// POST multipart `logo` (PNG/JPEG/WebP, max 3 MB); DELETE removes it.
export const POST = adapt(hospitals.uploadLogo, 'hospitals.manage');
export const DELETE = adapt(hospitals.removeLogo, 'hospitals.manage');
