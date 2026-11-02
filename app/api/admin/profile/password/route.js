import { adapt } from '../../../../../lib/adaptExpress';
import profileController from '../../../../../controllers/profileController';

export const PUT = adapt(profileController.changePassword);
