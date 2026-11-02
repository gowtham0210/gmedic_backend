import { adapt } from '../../../../../../lib/adaptExpress';
import appointments from '../../../../../../controllers/doctor/appointmentsController';

export const GET = adapt(appointments.notes, { scope: 'doctor' });
export const POST = adapt(appointments.saveNotes, { scope: 'doctor' });
