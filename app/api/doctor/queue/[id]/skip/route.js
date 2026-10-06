import { adapt } from '../../../../../../lib/adaptExpress';
import queue from '../../../../../../controllers/doctor/queueController';

export const POST = adapt(queue.skip, { scope: 'doctor' });
