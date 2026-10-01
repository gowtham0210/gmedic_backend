import { adapt } from '../../../../lib/adaptExpress';
import qr from '../../../../controllers/admin/qrController';

export const GET = adapt(qr.list, 'qr.view');
export const POST = adapt(qr.create, 'qr.manage');
