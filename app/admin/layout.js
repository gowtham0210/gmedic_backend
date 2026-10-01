import Script from 'next/script';
import { requireAdmin } from '../../lib/rbac';
import { permissionsFor } from '../../config/permissions';
import userModel from '../../models/userModel';
import Sidebar from '../../components/admin/Sidebar';
import Topbar from '../../components/admin/Topbar';
import LogoutModal from '../../components/LogoutModal';

export default async function AdminLayout({ children }) {
  const user = await requireAdmin();
  const permissions = [...permissionsFor(user.role)];
  const publicUser = userModel.toPublic(user);

  return (
    <div className="shell">
      <Sidebar permissions={permissions} />
      <div className="main">
        <Topbar user={publicUser} />
        <main id="main" className="page" tabIndex={-1}>{children}</main>
      </div>

      <LogoutModal />
      <div className="toasts" id="toasts" aria-live="polite" aria-atomic="false"></div>

      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: `window.GMEDIC = ${JSON.stringify({ user: publicUser, permissions })};` }}
      />
      <Script src="/js/layout.js" strategy="afterInteractive" />
    </div>
  );
}
