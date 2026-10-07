import { adapt } from '../../../../../../lib/adaptExpress';
import qr from '../../../../../../controllers/admin/qrController';

export const GET = adapt(qr.png, 'qr.view');
