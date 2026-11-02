import { adapt } from '../../../../../lib/adaptExpress';
import leaves from '../../../../../controllers/doctor/leavesController';

export const GET = adapt(leaves.impact, { scope: 'doctor' });
