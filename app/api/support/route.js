import { adapt } from '../../../lib/adaptExpress';
import tickets from '../../../controllers/supportTicketsController';

export const GET = adapt(tickets.list, { scope: 'receptionist' });
export const POST = adapt(tickets.create, { scope: 'receptionist' });
