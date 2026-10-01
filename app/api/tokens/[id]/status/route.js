import { adapt } from '../../../../../lib/adaptExpress';
import tokenController from '../../../../../controllers/tokenController';

export const PATCH = adapt(tokenController.updateStatus, { scope: 'receptionist' });
