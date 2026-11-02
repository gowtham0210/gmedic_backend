import { adapt } from '../../../../../../lib/adaptExpress';
import doctors from '../../../../../../controllers/admin/doctorsController';

export const POST = adapt(doctors.uploadPhoto, 'doctors.manage');
export const DELETE = adapt(doctors.removePhoto, 'doctors.manage');
