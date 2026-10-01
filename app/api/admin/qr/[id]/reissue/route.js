import { adapt } from '../../../../../../lib/adaptExpress';
import qr from '../../../../../../controllers/admin/qrController';

export const POST = adapt(qr.reissue, 'qr.manage');
