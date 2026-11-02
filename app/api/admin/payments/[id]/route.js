import { adapt } from '../../../../../lib/adaptExpress';
import payments from '../../../../../controllers/admin/paymentsController';

export const GET = adapt(payments.get, 'payments.view');
