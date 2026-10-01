import { adapt } from '../../../../../lib/adaptExpress';
import doctorController from '../../../../../controllers/doctorController';

export const PATCH = adapt(doctorController.setAvailability, { scope: 'receptionist' });
