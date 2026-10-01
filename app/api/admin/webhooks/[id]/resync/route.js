import { adapt } from '../../../../../../lib/adaptExpress';
import payments from '../../../../../../controllers/admin/paymentsController';

export const POST = adapt(payments.resyncWebhook, 'webhooks.manage');
