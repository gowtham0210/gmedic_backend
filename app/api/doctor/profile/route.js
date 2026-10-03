import { adapt } from '../../../../lib/adaptExpress';
import profile from '../../../../controllers/doctor/profileController';

export const GET = adapt(profile.get, { scope: 'doctor' });
export const PUT = adapt(profile.update, { scope: 'doctor' });
