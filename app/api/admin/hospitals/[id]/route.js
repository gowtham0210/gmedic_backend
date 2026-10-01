import { adapt } from '../../../../../lib/adaptExpress';
import hospitals from '../../../../../controllers/admin/hospitalsController';

export const GET = adapt(hospitals.get, 'hospitals.view');
export const PUT = adapt(hospitals.update, 'hospitals.manage');
