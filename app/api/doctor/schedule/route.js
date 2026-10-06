import { adapt } from '../../../../lib/adaptExpress';
import schedule from '../../../../controllers/doctor/scheduleController';

export const GET = adapt(schedule.list, { scope: 'doctor' });
export const POST = adapt(schedule.create, { scope: 'doctor' });
