import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

export const GET = adapt(hospitals.listBranches, 'branches.view');
export const POST = adapt(hospitals.createBranch, 'branches.manage');
