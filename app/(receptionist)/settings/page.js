import Script from 'next/script';
import Icon from '../../../components/Icon';
import { requireReceptionist } from '../../../lib/rbac';
import userModel from '../../../models/userModel';
import hospitalModel from '../../../models/hospitalModel';

export const metadata = { title: 'Settings · Gmedic' };

export default async function SettingsPage() {
  const rawUser = await requireReceptionist();
  const user = userModel.toPublic(rawUser);
  const hospital = await hospitalModel.toPublic(await hospitalModel.findById(rawUser.hospitalId));
  const pwLabel = user.passwordChangedAt
    ? `Last changed ${new Date(user.passwordChangedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : "Use a strong password you don't use elsewhere.";

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><Icon name="chevron-right" /><span>Settings</span></nav>
          <h1>Settings</h1>
          <p>Manage your receptionist profile and password.</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="card settings-nav" aria-label="Settings sections">
          <a className="nav__link is-active" href="#profile" data-section-link="profile"><Icon name="user" />Profile</a>
          <a className="nav__link" href="#password" data-section-link="password"><Icon name="lock" />Change password</a>
          <button type="button" className="nav__link nav__link--danger" data-logout><Icon name="log-out" />Logout</button>
        </nav>

        <div>
          <section className="card settings-panel" id="profile">
            <div className="card__head">
              <div>
                <h2 className="card__title"><Icon name="user" />Receptionist profile</h2>
                <p className="card__subtitle">Your name and phone number are shown to hospital staff.</p>
              </div>
            </div>

            <div className="profile-card">
              <span className="avatar avatar--teal avatar--lg" data-user-initials>{user.initials}</span>
              <div>
                <strong data-user-name>{user.name}</strong>
                <small>Receptionist · {hospital.name}</small>
              </div>
            </div>

            <form id="profile-form" noValidate>
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="pr-name">Full name <span className="req">*</span></label>
                  <input className="input" id="pr-name" name="name" required minLength={3} maxLength={60} defaultValue={user.name} autoComplete="name" />
                  <p className="field__error" data-error-for="name"></p>
                </div>
                <div className="field">
                  <label htmlFor="pr-phone">Phone <span className="req">*</span></label>
                  <input className="input" id="pr-phone" name="phone" type="tel" required defaultValue={user.phone} autoComplete="tel" />
                  <p className="field__error" data-error-for="phone"></p>
                </div>
                <div className="field">
                  <label htmlFor="pr-email">Email (login)</label>
                  <div className="input-wrap"><Icon name="lock" /><input className="input" id="pr-email" defaultValue={user.email} readOnly /></div>
                  <p className="field__hint">Contact your Gmedic administrator to change your login email.</p>
                </div>
                <div className="field">
                  <label htmlFor="pr-username">Username</label>
                  <div className="input-wrap"><Icon name="lock" /><input className="input" id="pr-username" defaultValue={user.username} readOnly /></div>
                </div>
                <div className="field">
                  <label htmlFor="pr-role">Role</label>
                  <input className="input" id="pr-role" defaultValue="Receptionist" readOnly />
                </div>
                <div className="field">
                  <label htmlFor="pr-hospital">Hospital</label>
                  <input className="input" id="pr-hospital" defaultValue={`${hospital.name} (${hospital.id})`} readOnly />
                </div>
              </div>
              <div className="form-actions">
                <button type="reset" className="btn btn--ghost">Cancel</button>
                <button type="submit" className="btn btn--primary"><Icon name="check" /><span>Save profile</span></button>
              </div>
            </form>
          </section>

          <section className="card settings-panel" id="password">
            <div className="card__head">
              <div>
                <h2 className="card__title"><Icon name="lock" />Change password</h2>
                <p className="card__subtitle" data-pw-changed>{pwLabel}</p>
              </div>
            </div>
            <form id="password-form" noValidate autoComplete="off">
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
              <input type="text" name="username" defaultValue={user.username} autoComplete="username" hidden readOnly />
              <div className="form-grid">
                <div className="field field--full" style={{ maxWidth: 'calc(50% - 8px)', minWidth: 'min(100%,280px)' }}>
                  <label htmlFor="pw-current">Current password <span className="req">*</span></label>
                  <div className="input-wrap">
                    <input className="input" id="pw-current" name="currentPassword" type="password" required autoComplete="current-password" />
                    <button type="button" className="input-toggle" data-toggle-password="pw-current" aria-label="Show password"><Icon name="eye" /></button>
                  </div>
                  <p className="field__error" data-error-for="currentPassword"></p>
                </div>
                <div className="field">
                  <label htmlFor="pw-new">New password <span className="req">*</span></label>
                  <div className="input-wrap">
                    <input className="input" id="pw-new" name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
                    <button type="button" className="input-toggle" data-toggle-password="pw-new" aria-label="Show password"><Icon name="eye" /></button>
                  </div>
                  <div className="strength" data-level="0" data-strength aria-hidden="true"><span></span><span></span><span></span><span></span></div>
                  <p className="field__hint" data-strength-label>At least 8 characters, with a letter and a number.</p>
                  <p className="field__error" data-error-for="newPassword"></p>
                </div>
                <div className="field">
                  <label htmlFor="pw-confirm">Confirm new password <span className="req">*</span></label>
                  <div className="input-wrap">
                    <input className="input" id="pw-confirm" name="confirmPassword" type="password" required autoComplete="new-password" />
                    <button type="button" className="input-toggle" data-toggle-password="pw-confirm" aria-label="Show password"><Icon name="eye" /></button>
                  </div>
                  <p className="field__error" data-error-for="confirmPassword"></p>
                </div>
              </div>
              <div className="form-actions">
                <button type="reset" className="btn btn--ghost">Clear</button>
                <button type="submit" className="btn btn--primary"><Icon name="lock" /><span>Update password</span></button>
              </div>
            </form>
          </section>
        </div>
      </div>

      <Script src="/js/pages/settings.js" strategy="afterInteractive" />
    </>
  );
}
