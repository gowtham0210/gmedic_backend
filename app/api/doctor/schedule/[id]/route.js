import { adapt } from '../../../../../lib/adaptExpress';
import schedule from '../../../../../controllers/doctor/scheduleController';

export const PATCH = adapt(schedule.update, { scope: 'doctor' });
export const DELETE = adapt(schedule.remove, { scope: 'doctor' });
