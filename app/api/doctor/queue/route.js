import { adapt } from '../../../../lib/adaptExpress';
import queue from '../../../../controllers/doctor/queueController';

export const GET = adapt(queue.list, { scope: 'doctor' });
