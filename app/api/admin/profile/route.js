import { adapt } from '../../../../lib/adaptExpress';
import profileController from '../../../../controllers/profileController';

// Every admin role manages its own profile, so no extra permission is needed.
export const GET = adapt(profileController.me);
export const PUT = adapt(profileController.updateAdmin);
