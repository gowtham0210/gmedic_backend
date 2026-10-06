import { adapt } from '../../../../lib/adaptExpress';
import tickets from '../../../../controllers/supportTicketsController';

export const GET = adapt(tickets.list, { scope: 'doctor' });
export const POST = adapt(tickets.create, { scope: 'doctor' });
