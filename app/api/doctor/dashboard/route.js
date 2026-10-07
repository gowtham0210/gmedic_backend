import { adapt } from '../../../../lib/adaptExpress';
import dashboard from '../../../../controllers/doctor/dashboardController';

export const GET = adapt(dashboard.get, { scope: 'doctor' });
