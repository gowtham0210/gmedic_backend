import { adapt } from '../../../../../lib/adaptExpress';
import support from '../../../../../controllers/admin/supportController';

export const GET = adapt(support.get, 'support.view_all');
