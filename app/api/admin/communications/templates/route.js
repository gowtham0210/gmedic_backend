import { adapt } from '../../../../../lib/adaptExpress';
import communications from '../../../../../controllers/admin/communicationsController';

export const GET = adapt(communications.listTemplates, 'communications.templates.view');
export const POST = adapt(communications.createTemplate, 'communications.templates.create');
