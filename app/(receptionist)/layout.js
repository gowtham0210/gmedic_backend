import Script from 'next/script';
import { requireReceptionist } from '../../lib/rbac';
import userModel from '../../models/userModel';
import hospitalModel from '../../models/hospitalModel';
import Sidebar from '../../components/receptionist/Sidebar';
import Topbar from '../../components/receptionist/Topbar';
import PortalNotices from '../../components/shared/PortalNotices';
import LogoutModal from '../../components/LogoutModal';

export default async function ReceptionistLayout({ children }) {
  const user = await requireReceptionist();
  const publicUser = userModel.toPublic(user);
  const hospital = await hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId));

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar user={publicUser} hospital={hospital} />
        <main id="main" className="page" tabIndex={-1}>
          <PortalNotices hospitalId={user.hospitalId} />
          {children}
        </main>
      </div>

      <LogoutModal />
      <div className="toasts" id="toasts" aria-live="polite" aria-atomic="false"></div>

      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: `window.GMEDIC = ${JSON.stringify({ user: publicUser, hospital })};` }}
      />
      <Script src="/js/layout.js" strategy="afterInteractive" />
    </div>
  );
}
