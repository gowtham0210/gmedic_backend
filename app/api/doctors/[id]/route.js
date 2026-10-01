import { adapt } from '../../../../lib/adaptExpress';
import doctorController from '../../../../controllers/doctorController';

export const GET = adapt(doctorController.get, { scope: 'receptionist' });
export const PUT = adapt(doctorController.update, { scope: 'receptionist' });
