import { adapt } from '../../../../lib/adaptExpress';
import leaves from '../../../../controllers/doctor/leavesController';

export const GET = adapt(leaves.list, { scope: 'doctor' });
export const POST = adapt(leaves.create, { scope: 'doctor' });
