import { adapt } from '../../../../../../../lib/adaptExpress';
import communications from '../../../../../../../controllers/admin/communicationsController';

// Enable vs disable is a different permission each; the controller checks the one that applies.
export const PATCH = adapt(communications.setTemplateStatus, 'communications.templates.view');
