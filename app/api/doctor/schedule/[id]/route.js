import { adapt } from '../../../../../lib/adaptExpress';
import schedule from '../../../../../controllers/doctor/scheduleController';

export const DELETE = adapt(schedule.remove, { scope: 'doctor' });
