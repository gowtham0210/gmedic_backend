import { adapt } from '../../../../lib/adaptExpress';
import settings from '../../../../controllers/admin/settingsController';

export const GET = adapt(settings.listAppVersions, 'app_versions.view');
