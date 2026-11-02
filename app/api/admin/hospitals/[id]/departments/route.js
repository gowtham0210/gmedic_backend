import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

export const GET = adapt(hospitals.listDepartments, 'hospitals.view');
export const POST = adapt(hospitals.createDepartment, 'hospitals.manage');
