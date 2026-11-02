import Script from 'next/script';
import Icon from '../../../components/Icon';
import QrModal from '../../../components/receptionist/modals/QrModal';
import { HospitalStatusBadge, HospitalStatusNotice, NoActiveQr } from '../../../components/receptionist/HospitalStatusBadge';
import { requireReceptionist } from '../../../lib/rbac';
import hospitalModel from '../../../models/hospitalModel';

export const metadata = { title: 'Hospital Information · Gmedic' };

export default async function HospitalPage() {
  const user = await requireReceptionist();
  const hospital = await hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId));

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><Icon name="chevron-right" /><span>Hospital Information</span></nav>
          <h1>Hospital Information</h1>
          <p>Your hospital&apos;s details and the unique QR code patients scan in the Gmedic app.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--ghost" data-edit-hospital><Icon name="pencil" />Edit contact details</button>
        </div>
      </div>

      <HospitalStatusNotice hospital={hospital} style={{ marginBottom: 16 }} />

      <div className="two-col">
        <div>
          <article className="card" data-hospital-view>
            <div className="info-hero">
              <div className="info-hero__img"><img src={hospital.logoUrl || '/images/hospital-illustration.svg'} alt={hospital.logoUrl ? `${hospital.name} logo` : ''} /></div>
              <div>
                <h2 data-h-name>{hospital.name}</h2>
                <div className="info-hero__meta">
                  <span className="badge badge--teal badge--plain"><Icon name="hash" className="icon--xs" />Hospital ID: {hospital.id}</span>
                  <HospitalStatusBadge hospital={hospital} />
                </div>
              </div>
            </div>

            <div className="detail-list">
              <div className="detail">
                <span className="detail__icon"><Icon name="hospital" /></span>
                <div><div className="detail__label">Hospital name <Icon name="lock" /></div><div className="detail__value">{hospital.name}</div></div>
              </div>
              <div className="detail">
                <span className="detail__icon"><Icon name="hash" /></span>
                <div><div className="detail__label">Hospital ID <Icon name="lock" /></div><div className="detail__value">{hospital.id}</div></div>
              </div>
              <div className="detail">
                <span className="detail__icon"><Icon name="phone" /></span>
                <div><div className="detail__label">Contact number</div><div className="detail__value" data-h-phone>{hospital.phone}</div></div>
              </div>
              <div className="detail">
                <span className="detail__icon"><Icon name="mail" /></span>
                <div><div className="detail__label">Email</div><div className="detail__value" data-h-email>{hospital.email}</div></div>
              </div>
              <div className="detail detail--full" style={{ borderBottom: 0 }}>
                <span className="detail__icon"><Icon name="map-pin" /></span>
                <div><div className="detail__label">Address</div><div className="detail__value" data-h-address>{hospital.addressText}</div></div>
              </div>
            </div>

            {hospital.about && (
              <div className="detail detail--full" style={{ borderBottom: 0, paddingTop: 0 }}>
                <span className="detail__icon"><Icon name="info" /></span>
                <div><div className="detail__label">About <Icon name="lock" /></div><div className="detail__value" style={{ fontWeight: 400, whiteSpace: 'pre-line' }}>{hospital.about}</div></div>
              </div>
            )}

            <p className="note"><Icon name="info" /><span>The hospital name, ID, logo and “About” text patients see in the app are managed by Gmedic. Contact Gmedic support to change them. You can update the contact number, email and address.</span></p>
          </article>

          <article className="card" data-hospital-edit hidden>
            <div className="card__head" style={{ paddingBottom: 18, borderBottom: '1px solid var(--border-2)' }}>
              <div>
                <h2 className="card__title"><Icon name="pencil" />Edit contact details</h2>
                <p className="card__subtitle">Changes are visible to patients in the Gmedic app.</p>
              </div>
            </div>
            <form id="hospital-form" noValidate>
              <div className="alert alert--error" hidden data-form-alert style={{ marginBottom: 16 }}><Icon name="alert" /><span></span></div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="h-name">Hospital name</label>
                  <div className="input-wrap"><Icon name="lock" /><input className="input" id="h-name" defaultValue={hospital.name} readOnly /></div>
                </div>
                <div className="field">
                  <label htmlFor="h-id">Hospital ID</label>
                  <div className="input-wrap"><Icon name="lock" /><input className="input" id="h-id" defaultValue={hospital.id} readOnly /></div>
                </div>
                <div className="field">
                  <label htmlFor="h-phone">Contact number <span className="req">*</span></label>
                  <input className="input" id="h-phone" name="phone" type="tel" required placeholder="+91 98765 43210" defaultValue={hospital.phone} />
                  <p className="field__error" data-error-for="phone"></p>
                </div>
                <div className="field">
                  <label htmlFor="h-email">Email <span className="req">*</span></label>
                  <input className="input" id="h-email" name="email" type="email" required placeholder="care@hospital.in" defaultValue={hospital.email} />
                  <p className="field__error" data-error-for="email"></p>
                </div>
                <div className="field field--full">
                  <label htmlFor="h-line1">Street address <span className="req">*</span></label>
                  <input className="input" id="h-line1" name="line1" required maxLength={160} defaultValue={hospital.address.line1} />
                  <p className="field__error" data-error-for="line1"></p>
                </div>
                <div className="field">
                  <label htmlFor="h-city">City <span className="req">*</span></label>
                  <input className="input" id="h-city" name="city" required maxLength={60} defaultValue={hospital.address.city} />
                  <p className="field__error" data-error-for="city"></p>
                </div>
                <div className="field">
                  <label htmlFor="h-state">State <span className="req">*</span></label>
                  <input className="input" id="h-state" name="state" required maxLength={60} defaultValue={hospital.address.state} />
                  <p className="field__error" data-error-for="state"></p>
                </div>
                <div className="field">
                  <label htmlFor="h-pincode">PIN code <span className="req">*</span></label>
                  <input className="input" id="h-pincode" name="pincode" required inputMode="numeric" maxLength={6} pattern="\d{6}" defaultValue={hospital.address.pincode} />
                  <p className="field__error" data-error-for="pincode"></p>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn--ghost" data-cancel-edit>Cancel</button>
                <button type="submit" className="btn btn--primary"><Icon name="check" /><span>Save changes</span></button>
              </div>
            </form>
          </article>
        </div>

        <aside className="qr-card-col">
          <article className="card qr-card">
            <div className="card__head" style={{ justifyContent: 'center' }}>
              <h2 className="card__title"><Icon name="qr-code" />Unique Hospital QR Code</h2>
            </div>
            {!hospital.qrLink ? <NoActiveQr /> : (<>
            <button type="button" className="qr-card__poster" data-open-qr aria-label="View QR poster full size" style={{ display: 'block', width: 'min(340px,100%)', margin: '0 auto', padding: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff', cursor: 'zoom-in' }}>
              <img src="/api/hospital/qr-poster.svg" alt={`Gmedic QR poster for ${hospital.name}`} width="1060" height="1500" style={{ width: '100%', height: 'auto' }} />
            </button>
            <p className="qr-card__id">Hospital ID · {hospital.id} · Display this poster at your reception desk.</p>

            <div className="qr-card__actions">
              <button type="button" className="btn btn--outline" data-open-qr><Icon name="eye" />View QR</button>
              <button type="button" className="btn btn--primary" data-download-poster><Icon name="download" /><span>Download QR</span></button>
            </div>
            <div className="qr-card__more">
              <button type="button" className="btn btn--ghost btn--sm" data-qr-print><Icon name="printer" />Print poster</button>
              <a className="btn btn--ghost btn--sm" href="/api/hospital/qr.png?download=1" download><Icon name="qr-code" />QR code only</a>
            </div>
            <div className="qr-card__link">
              <code title={hospital.qrLink}>{hospital.qrLink}</code>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="Copy QR link" data-copy={hospital.qrLink}><Icon name="copy" /></button>
            </div>
            </>)}

            <ol className="steps">
              <li><span className="steps__num">1</span><div><strong>Display at reception</strong><span>Print or show this QR code at your front desk.</span></div></li>
              <li><span className="steps__num">2</span><div><strong>Patient scans in Gmedic app</strong><span>Patients open the Gmedic app and scan the code.</span></div></li>
              <li><span className="steps__num">3</span><div><strong>Hospital is added</strong><span>They can then book appointments with your doctors.</span></div></li>
            </ol>
          </article>
        </aside>
      </div>

      <QrModal hospitalName={hospital.name} />
      <Script src="/js/qr-modal.js" strategy="afterInteractive" />
      <Script src="/js/pages/hospital.js" strategy="afterInteractive" />
    </>
  );
}
