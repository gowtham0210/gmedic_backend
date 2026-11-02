import { adapt } from '../../../../../../../../lib/adaptExpress';
import hospitals from '../../../../../../../../controllers/admin/hospitalsController';

export const POST = adapt(hospitals.withdrawDocument, 'kyc.manage');
