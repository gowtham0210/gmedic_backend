import { adapt } from '../../../../../../lib/adaptExpress';
import support from '../../../../../../controllers/admin/supportController';

export const PATCH = adapt(support.setPriority, 'support.update_status');
