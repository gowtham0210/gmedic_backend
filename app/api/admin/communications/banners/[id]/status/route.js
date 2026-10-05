import { adapt } from '../../../../../../../lib/adaptExpress';
import communications from '../../../../../../../controllers/admin/communicationsController';

// Activate vs deactivate is a different permission each; the controller checks the one that applies.
export const PATCH = adapt(communications.setBannerStatus, 'communications.banners.view');
