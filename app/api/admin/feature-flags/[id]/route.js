import { adapt } from '../../../../../lib/adaptExpress';
import settings from '../../../../../controllers/admin/settingsController';

export const PATCH = adapt(settings.setFlag, 'feature_flags.manage');
