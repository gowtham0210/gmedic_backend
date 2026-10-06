import { adapt } from '../../../../../lib/adaptExpress';
import communications from '../../../../../controllers/admin/communicationsController';

export const GET = adapt(communications.listAnnouncements, 'communications.announcements.view');
export const POST = adapt(communications.createAnnouncement, 'communications.announcements.create');
