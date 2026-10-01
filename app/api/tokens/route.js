import { adapt } from '../../../lib/adaptExpress';
import tokenController from '../../../controllers/tokenController';

export const GET = adapt(tokenController.list, { scope: 'receptionist' });
export const POST = adapt(tokenController.create, { scope: 'receptionist' });
