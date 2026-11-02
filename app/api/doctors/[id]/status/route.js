import { adapt } from '../../../../../lib/adaptExpress';
import doctorController from '../../../../../controllers/doctorController';

export const GET = adapt(doctorController.statusImpact, { scope: 'receptionist' });
export const PATCH = adapt(doctorController.setStatus, { scope: 'receptionist' });
