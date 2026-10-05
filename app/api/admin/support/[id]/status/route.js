import { adapt } from '../../../../../../lib/adaptExpress';
import support from '../../../../../../controllers/admin/supportController';

// 'support.update_status' to resolve/reopen; closing additionally needs 'support.close' (checked in the controller).
export const PATCH = adapt(support.setStatus, 'support.update_status');
