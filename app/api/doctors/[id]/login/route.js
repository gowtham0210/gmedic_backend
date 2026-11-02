import { adapt } from '../../../../../lib/adaptExpress';
import doctorController from '../../../../../controllers/doctorController';

// The front desk invites one of its doctors to the doctor portal.
export const POST = adapt(doctorController.inviteLogin, { scope: 'receptionist' });
