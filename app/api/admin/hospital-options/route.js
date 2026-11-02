import { adapt } from '../../../../lib/adaptExpress';
import hospitals from '../../../../controllers/admin/hospitalsController';

// No permission needed beyond an admin sign-in: it is only names, so every console role (Support
// included, which has no hospitals.view) can fill its hospital filters.
export const GET = adapt(hospitals.options);
