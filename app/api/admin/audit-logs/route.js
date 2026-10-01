import { adapt } from '../../../../lib/adaptExpress';
import auditLogs from '../../../../controllers/admin/auditLogsController';

export const GET = adapt(auditLogs.list, 'audit_logs.view');
