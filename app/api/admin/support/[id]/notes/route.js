import { adapt } from '../../../../../../lib/adaptExpress';
import support from '../../../../../../controllers/admin/supportController';

// Staff-only: never exposed to the doctor or receptionist who raised the ticket.
export const GET = adapt(support.listNotes, 'support.view_all');
export const POST = adapt(support.addNote, 'support.reply');
