import { adapt } from '../../../../../lib/adaptExpress';
import leaves from '../../../../../controllers/doctor/leavesController';

export const DELETE = adapt(leaves.remove, { scope: 'doctor' });
