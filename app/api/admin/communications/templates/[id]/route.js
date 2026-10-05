import { adapt } from '../../../../../../lib/adaptExpress';
import communications from '../../../../../../controllers/admin/communicationsController';

export const PATCH = adapt(communications.updateTemplate, 'communications.templates.update');
