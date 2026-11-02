import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

export const GET = adapt(hospitals.getPolicy, 'hospitals.view');
export const PUT = adapt(hospitals.updatePolicy, 'hospitals.manage');
