import { adapt } from '../../../../lib/adaptExpress';
import settings from '../../../../controllers/admin/settingsController';

export const GET = adapt(settings.getSettings, 'settings.view');
export const PUT = adapt(settings.updateSetting, 'settings.manage');
