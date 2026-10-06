import { adapt } from '../../../../lib/adaptExpress';
import patients from '../../../../controllers/doctor/patientsController';

export const GET = adapt(patients.list, { scope: 'doctor' });
