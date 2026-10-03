import { adapt } from '../../../../lib/adaptExpress';
import support from '../../../../controllers/doctor/supportController';

export const GET = adapt(support.list, { scope: 'doctor' });
export const POST = adapt(support.create, { scope: 'doctor' });
