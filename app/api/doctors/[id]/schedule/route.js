import { adapt } from '../../../../../lib/adaptExpress';
import doctors from '../../../../../controllers/doctorController';

// The front desk manages a doctor's weekly hours (the doctor portal has the same screen for their own).
export const GET = adapt(doctors.scheduleList, { scope: 'receptionist' });
export const POST = adapt(doctors.scheduleCreate, { scope: 'receptionist' });
