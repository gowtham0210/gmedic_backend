import { adapt } from '../../../../lib/adaptExpress';
import doctors from '../../../../controllers/admin/doctorsController';

export const GET = adapt(doctors.list, 'doctors.view');
