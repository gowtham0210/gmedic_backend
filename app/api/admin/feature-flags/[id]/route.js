import { adapt } from '../../../../../lib/adaptExpress';
import settings from '../../../../../controllers/admin/settingsController';

// Removes a hospital's override so it follows the platform default again.
export const DELETE = adapt(settings.removeOverride, 'feature_flags.manage');
