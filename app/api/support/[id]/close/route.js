import { adapt } from '../../../../../lib/adaptExpress';
import tickets from '../../../../../controllers/supportTicketsController';

export const POST = adapt(tickets.close, { scope: 'receptionist' });
