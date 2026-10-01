import { adapt } from '../../../lib/adaptExpress';
import hospitalController from '../../../controllers/hospitalController';

export const GET = adapt(hospitalController.get, { scope: 'receptionist' });
export const PUT = adapt(hospitalController.update, { scope: 'receptionist' });
