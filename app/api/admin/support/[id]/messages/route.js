import { adapt } from '../../../../../../lib/adaptExpress';
import support from '../../../../../../controllers/admin/supportController';

export const POST = adapt(support.reply, 'support.reply');
