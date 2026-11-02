import { adapt } from '../../../../lib/adaptExpress';
import settings from '../../../../controllers/admin/settingsController';

export const GET = adapt(settings.listFlags, 'feature_flags.view');
// Sets the platform default (no hospitalId) or one hospital's override.
export const POST = adapt(settings.setFlag, 'feature_flags.manage');
