import { adapt } from '../../../../../lib/adaptExpress';
import communications from '../../../../../controllers/admin/communicationsController';

export const GET = adapt(communications.listBanners, 'communications.view');
export const POST = adapt(communications.createBanner, 'communications.manage');
