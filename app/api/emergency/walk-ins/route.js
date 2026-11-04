import { adapt } from '../../../../lib/adaptExpress';
import emergency from '../../../../controllers/emergencyController';

export const POST = adapt(emergency.register, { scope: 'receptionist' });
