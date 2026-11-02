import { adapt } from '../../../../../lib/adaptExpress';
import auditLogs from '../../../../../controllers/admin/auditLogsController';

export const GET = adapt(auditLogs.export, 'audit_logs.view');
