import Script from 'next/script';
import { requireDoctor } from '../../lib/rbac';
import userModel from '../../models/userModel';
import hospitalModel from '../../models/hospitalModel';
import doctorModel from '../../models/doctorModel';
import Sidebar from '../../components/doctor/Sidebar';
import Topbar from '../../components/doctor/Topbar';
import LogoutModal from '../../components/LogoutModal';

export default async function DoctorLayout({ children }) {
  const user = await requireDoctor();
  const publicUser = userModel.toPublic(user);
  const [hospital, doctor] = await Promise.all([
    hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId)),
    user.doctorId ? doctorModel.findById(user.hospitalId, user.doctorId) : null,
  ]);
  const doctorSafe = doctor || { specialization: '—', availability: 'absent' };

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar user={publicUser} doctor={doctorSafe} hospital={hospital} />
        <main id="main" className="page" tabIndex={-1}>{children}</main>
      </div>

      <LogoutModal />
      <div className="toasts" id="toasts" aria-live="polite" aria-atomic="false"></div>

      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: `window.GMEDIC = ${JSON.stringify({ user: publicUser, hospital, doctor })};` }}
      />
      <Script src="/js/layout.js" strategy="afterInteractive" />
    </div>
  );
}
