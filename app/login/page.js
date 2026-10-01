import Script from 'next/script';
import Icon from '../../components/Icon';
import { redirectIfAuthenticated } from '../../lib/rbac';

export const metadata = { title: 'Log in · Gmedic' };

const ROLES = [
  { key: 'SUPER_ADMIN', label: 'Super Admin', icon: 'shield' },
  { key: 'RECEPTIONIST', label: 'Receptionist', icon: 'hospital' },
  { key: 'DOCTOR', label: 'Doctor', icon: 'stethoscope' },
];

export default async function LoginPage({ searchParams }) {
  await redirectIfAuthenticated();
  const sp = await searchParams;
  const role = ROLES.some((r) => r.key === sp.role) ? sp.role : 'RECEPTIONIST';
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '';
  const loggedOut = sp.loggedOut === '1';
  const expired = sp.expired === '1';
  const denied = sp.denied === '1';

  return (
    <div className="auth">
      <section className="auth__brand" aria-hidden="true">
        <img className="auth__logo" src="/images/gmedic-logo-light.png" alt="" />
        <div className="auth__pitch">
          <span className="auth__eyebrow"><Icon name="shield-check" /> One login, three portals</span>
          <h2>Run your hospital network, <span>all from Gmedic.</span></h2>
          <p>Super Admins oversee every hospital on the platform. Receptionists run their front desk. Doctors manage their own schedule. One account system, one login screen.</p>
          <ul className="auth__features">
            <li><span className="f-icon"><Icon name="hospital" /></span>Onboard and oversee every hospital</li>
            <li><span className="f-icon"><Icon name="shield-check" /></span>Role-based access, enforced on the server</li>
            <li><span className="f-icon"><Icon name="clipboard-list" /></span>A full audit trail of every admin action</li>
          </ul>
        </div>
        <p className="auth__foot">© {new Date().getFullYear()} Gmedic · Book · Consult · Care</p>
      </section>

      <main className="auth__main">
        <div className="auth__card">
          <img className="auth__card-logo" src="/images/gmedic-logo.png" alt="Gmedic — Book · Consult · Care" />

          <div data-panel="login">
            <h1>Welcome back</h1>
            <p>Log in as <span data-role-name>{ROLES.find((r) => r.key === role).label}</span>.</p>

            <form className="auth__form" id="login-form" noValidate>
              <input type="hidden" name="next" id="next-field" defaultValue={next} />
              <input type="hidden" name="role" id="role" defaultValue={role} />

              <div className="role-tabs" role="tablist" aria-label="Login as">
                {ROLES.map((r) => (
                  <button type="button" key={r.key} className={`role-tab${r.key === role ? ' is-active' : ''}`} data-role-tab={r.key} role="tab" aria-selected={r.key === role}>
                    <Icon name={r.icon} />
                    {r.label}
                  </button>
                ))}
              </div>

              {loggedOut && <div className="alert alert--success" data-flash><Icon name="check-circle" /><span>You have been logged out securely.</span></div>}
              {!loggedOut && expired && <div className="alert alert--info" data-flash><Icon name="info" /><span>Your session has ended. Please log in again.</span></div>}
              {!loggedOut && !expired && denied && <div className="alert alert--error" data-flash><Icon name="alert" /><span>Your role doesn&apos;t have permission to view that page.</span></div>}
              <div className="alert alert--error" hidden data-form-alert><Icon name="alert" /><span></span></div>

              <div className="field">
                <label htmlFor="identifier">Email or username</label>
                <div className="input-wrap">
                  <Icon name="mail" />
                  <input className="input" id="identifier" name="identifier" type="text" autoComplete="username" required placeholder="you@gmedic.app" autoFocus />
                </div>
                <p className="field__error" data-error-for="identifier"></p>
              </div>

              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="input-wrap">
                  <Icon name="lock" />
                  <input className="input" id="password" name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" />
                  <button type="button" className="input-toggle" data-toggle-password="password" aria-label="Show password"><Icon name="eye" /></button>
                </div>
                <p className="field__error" data-error-for="password"></p>
              </div>

              <div className="auth__row">
                <label className="checkbox"><input type="checkbox" name="remember" /> Remember me</label>
                <button type="button" className="auth__link" data-show-panel="forgot">Forgot password?</button>
              </div>

              <button type="submit" className="btn btn--primary btn--block"><span>Login</span><Icon name="arrow-right" /></button>
            </form>

            <div className="demo-creds" style={{ display: role === 'SUPER_ADMIN' ? 'block' : 'none' }} data-demo-box="SUPER_ADMIN">
              <strong>Demo account</strong> — <code>admin@gmedic.app</code> / <code>GmedicAdmin@123</code>
              {' · '}<button type="button" data-fill-demo data-role="SUPER_ADMIN" data-identifier="admin@gmedic.app" data-password="GmedicAdmin@123">Use demo login</button>
            </div>

            <div className="demo-creds" style={{ display: role === 'RECEPTIONIST' ? 'block' : 'none' }} data-demo-box="RECEPTIONIST">
              <strong>Demo account</strong> — <code>riya.sharma@sunrisegeneral.in</code> / <code>Gmedic@123</code>
              {' · '}<button type="button" data-fill-demo data-role="RECEPTIONIST" data-identifier="riya.sharma@sunrisegeneral.in" data-password="Gmedic@123">Use demo login</button>
            </div>

            <div className="demo-creds" style={{ display: role === 'DOCTOR' ? 'block' : 'none' }} data-demo-box="DOCTOR">
              <strong>Demo account</strong> — <code>doc101@sunrisegeneral.in</code> / <code>Gmedic@Doctor1</code>
              {' · '}<button type="button" data-fill-demo data-role="DOCTOR" data-identifier="doc101@sunrisegeneral.in" data-password="Gmedic@Doctor1">Use demo login</button>
            </div>
          </div>

          <div data-panel="forgot" hidden>
            <h1>Reset password</h1>
            <p>Enter your email or username. Your administrator will help you reset your password.</p>
            <form className="auth__form" id="forgot-form" noValidate>
              <div className="alert alert--error" hidden data-form-alert><Icon name="alert" /><span></span></div>
              <div className="alert alert--success" hidden data-form-success><Icon name="check-circle" /><span></span></div>
              <div className="field">
                <label htmlFor="forgot-identifier">Email or username</label>
                <div className="input-wrap">
                  <Icon name="mail" />
                  <input className="input" id="forgot-identifier" name="identifier" type="text" autoComplete="username" required placeholder="you@gmedic.app" />
                </div>
                <p className="field__error" data-error-for="identifier"></p>
              </div>
              <button type="submit" className="btn btn--primary btn--block"><span>Send reset request</span></button>
              <button type="button" className="btn btn--ghost btn--block" data-show-panel="login"><Icon name="arrow-left" />Back to login</button>
            </form>
          </div>

          <p className="auth__note"><Icon name="info" /><span>Super Admin and internal accounts are created by another Super Admin. Receptionist and doctor accounts are created by the hospital&apos;s Gmedic administrator. There is no public sign-up.</span></p>
        </div>
      </main>

      <div className="toasts" id="toasts" aria-live="polite"></div>
      <Script src="/js/pages/login-next.js" strategy="afterInteractive" />
    </div>
  );
}
