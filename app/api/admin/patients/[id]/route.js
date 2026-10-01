import { adapt } from '../../../../../lib/adaptExpress';
import patients from '../../../../../controllers/admin/patientsController';

export const GET = adapt(patients.get, 'patients.view');
