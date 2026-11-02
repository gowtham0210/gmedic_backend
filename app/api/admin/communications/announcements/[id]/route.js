import { adapt } from '../../../../../../lib/adaptExpress';
import communications from '../../../../../../controllers/admin/communicationsController';

// Whoever may write an announcement may correct or discard their draft; published ones are never edited.
export const PATCH = adapt(communications.updateAnnouncement, 'communications.announcements.create');
export const DELETE = adapt(communications.discardAnnouncement, 'communications.announcements.create');
