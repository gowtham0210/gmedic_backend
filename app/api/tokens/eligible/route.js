import { adapt } from '../../../../lib/adaptExpress';
import tokenController from '../../../../controllers/tokenController';

export const GET = adapt(tokenController.eligible, { scope: 'receptionist' });
