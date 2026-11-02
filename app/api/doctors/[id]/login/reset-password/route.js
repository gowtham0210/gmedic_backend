import { adapt } from '../../../../../../lib/adaptExpress';
import doctorController from '../../../../../../controllers/doctorController';

export const POST = adapt(doctorController.resetLoginPassword, { scope: 'receptionist' });
