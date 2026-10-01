import { adapt } from '../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../controllers/admin/hospitalsController';

export const PUT = adapt(hospitals.setFees, 'hospitals.manage');
