import { adapt } from '../../../../../../lib/adaptExpress';
import queue from '../../../../../../controllers/doctor/queueController';

export const PATCH = adapt(queue.triage, { scope: 'doctor' });
