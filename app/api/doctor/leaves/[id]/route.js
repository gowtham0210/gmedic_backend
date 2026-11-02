import { adapt } from '../../../../../lib/adaptExpress';
import leaves from '../../../../../controllers/doctor/leavesController';

export const PATCH = adapt(leaves.update, { scope: 'doctor' });
export const DELETE = adapt(leaves.remove, { scope: 'doctor' });
