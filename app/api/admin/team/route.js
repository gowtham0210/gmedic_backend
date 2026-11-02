import { adapt } from '../../../../lib/adaptExpress';
import team from '../../../../controllers/admin/teamController';

export const GET = adapt(team.list, 'team.view');
export const POST = adapt(team.create, 'team.manage');
