import { adapt } from '../../../../lib/adaptExpress';
import dashboard from '../../../../controllers/admin/dashboardController';

// Reuses the dashboard's query logic (bookings/revenue/QR-funnel/hospital
// growth trends) gated behind the separate analytics.view permission, so
// FINANCE-role admins can see trends without the full operational dashboard.
export const GET = adapt(dashboard.summary, 'analytics.view');
