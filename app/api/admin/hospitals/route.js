import { adapt } from '../../../../lib/adaptExpress';
import hospitals from '../../../../controllers/admin/hospitalsController';

export const GET = adapt(hospitals.list, 'hospitals.view');
export const POST = adapt(hospitals.create, 'hospitals.manage');
