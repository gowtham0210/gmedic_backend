import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

export const GET = adapt(hospitals.listRateHistory, 'hospitals.view');
