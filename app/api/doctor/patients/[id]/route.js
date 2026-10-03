import { adapt } from '../../../../../lib/adaptExpress';
import patients from '../../../../../controllers/doctor/patientsController';

export const GET = adapt(patients.get, { scope: 'doctor' });
