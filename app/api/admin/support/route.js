import { adapt } from '../../../../lib/adaptExpress';
import support from '../../../../controllers/admin/supportController';

export const GET = adapt(support.list, 'support.view_all');
