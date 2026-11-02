import { adapt } from '../../../../../../lib/adaptExpress';
import team from '../../../../../../controllers/admin/teamController';

export const POST = adapt(team.resetPassword, 'team.manage');
