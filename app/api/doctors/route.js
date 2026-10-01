import { adapt } from '../../../lib/adaptExpress';
import doctorController from '../../../controllers/doctorController';

export const GET = adapt(doctorController.list, { scope: 'receptionist' });
export const POST = adapt(doctorController.create, { scope: 'receptionist' });
