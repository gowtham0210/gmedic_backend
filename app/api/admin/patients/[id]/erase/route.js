import { adapt } from '../../../../../../lib/adaptExpress';
import patients from '../../../../../../controllers/admin/patientsController';

export const POST = adapt(patients.erase, 'patients.manage');
