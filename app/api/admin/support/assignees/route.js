import { adapt } from '../../../../../lib/adaptExpress';
import support from '../../../../../controllers/admin/supportController';

export const GET = adapt(support.assignees, 'support.view_all');
