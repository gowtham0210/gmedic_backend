import { adapt } from '../../../../../lib/adaptExpress';
import profile from '../../../../../controllers/doctor/profileController';

export const POST = adapt(profile.uploadPhoto, { scope: 'doctor' });
export const DELETE = adapt(profile.removePhoto, { scope: 'doctor' });
