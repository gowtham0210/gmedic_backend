import { adapt } from '../../../../../../lib/adaptExpress';
import support from '../../../../../../controllers/admin/supportController';

export const PATCH = adapt(support.assign, 'support.assign');
