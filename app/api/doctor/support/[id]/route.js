import { adapt } from '../../../../../lib/adaptExpress';
import tickets from '../../../../../controllers/supportTicketsController';

export const GET = adapt(tickets.get, { scope: 'doctor' });
