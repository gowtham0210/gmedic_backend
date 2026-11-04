import { adapt } from '../../../../../../lib/adaptExpress';
import intake from '../../../../../../controllers/admin/emergencyIntakeController';

export const GET = adapt(intake.get, 'hospitals.view');
export const PUT = adapt(intake.update, 'hospitals.manage');
