import { adapt } from '../../../../../lib/adaptExpress';
import qr from '../../../../../controllers/admin/qrController';

export const PATCH = adapt(qr.update, 'qr.manage');
