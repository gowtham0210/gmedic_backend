import { adapt } from '../../../../../lib/adaptExpress';
import settings from '../../../../../controllers/admin/settingsController';

export const PUT = adapt(settings.updateAppVersion, 'app_versions.manage');
