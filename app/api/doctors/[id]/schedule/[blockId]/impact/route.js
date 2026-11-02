import { adapt } from '../../../../../../../lib/adaptExpress';
import doctors from '../../../../../../../controllers/doctorController';

export const GET = adapt(doctors.scheduleImpact, { scope: 'receptionist' });
