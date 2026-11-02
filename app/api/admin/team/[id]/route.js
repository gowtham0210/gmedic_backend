import { adapt } from '../../../../../lib/adaptExpress';
import team from '../../../../../controllers/admin/teamController';

export const PATCH = adapt(team.update, 'team.manage');
