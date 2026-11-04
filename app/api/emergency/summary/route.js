import { adapt } from '../../../../lib/adaptExpress';
import emergency from '../../../../controllers/emergencyController';

export const GET = adapt(emergency.summary, { scope: 'receptionist' });
