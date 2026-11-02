import { adapt } from '../../../../../../lib/adaptExpress';
import schedule from '../../../../../../controllers/doctor/scheduleController';

export const GET = adapt(schedule.impact, { scope: 'doctor' });
