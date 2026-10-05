import { adapt } from '../../../../../../../lib/adaptExpress';
import communications from '../../../../../../../controllers/admin/communicationsController';

// Publish vs archive is a different permission each; the controller checks the one that applies.
export const PATCH = adapt(communications.setAnnouncementStatus, 'communications.announcements.view');
