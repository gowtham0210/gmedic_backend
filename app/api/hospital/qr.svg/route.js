import { adapt } from '../../../../lib/adaptExpress';
import hospitalController from '../../../../controllers/hospitalController';

export const GET = adapt(hospitalController.qrSvg, { scope: 'receptionist' });
