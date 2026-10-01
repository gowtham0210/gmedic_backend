import { adapt } from '../../../lib/adaptExpress';
import profileController from '../../../controllers/profileController';

export const GET = adapt(profileController.me, { scope: 'receptionist' });
