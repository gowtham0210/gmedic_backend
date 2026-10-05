import { adapt } from '../../../../../../lib/adaptExpress';
import disputes from '../../../../../../controllers/admin/disputesController';

export const GET = adapt(disputes.listNotes, 'disputes.view');
export const POST = adapt(disputes.addNote, 'disputes.manage');
