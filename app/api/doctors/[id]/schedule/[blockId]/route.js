import { adapt } from '../../../../../../lib/adaptExpress';
import doctors from '../../../../../../controllers/doctorController';

export const PATCH = adapt(doctors.scheduleUpdate, { scope: 'receptionist' });
export const DELETE = adapt(doctors.scheduleRemove, { scope: 'receptionist' });
