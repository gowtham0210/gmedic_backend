import db from '../../db';
import Icon from '../Icon';
import DismissibleNotice from './DismissibleNotice';

// Published announcements and active banners (managed under Super Admin ->
// Communications), shown at the top of the Doctor and Receptionist portals.
// A banner's button may only go inside the portal ("/doctor/schedule") or to a full https:// address.
const safeLink = (url) => (/^\/(?![/\\])[^\s\\]*$/.test(url || '') || /^https:\/\//i.test(url || ''));

export default async function PortalNotices({ hospitalId }) {
  const [announcements, banners] = await Promise.all([
    db.query(
      `SELECT id, title, message FROM announcements
       WHERE status = 'PUBLISHED' AND (target = 'ALL' OR id IN (SELECT announcement_id FROM announcement_hospitals WHERE hospital_id = ?))
       ORDER BY published_at DESC LIMIT 3`,
      [hospitalId]
    ),
    db.query(
      `SELECT id, title, message, cta_label, cta_url FROM banners
       WHERE status = 'ACTIVE' AND starts_at <= datetime('now') AND (ends_at IS NULL OR ends_at >= datetime('now'))
       ORDER BY created_at DESC LIMIT 2`
    ),
  ]);
  if (!announcements.length && !banners.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {banners.map((b) => (
        <div key={b.id} className="alert alert--info" style={{ alignItems: 'center' }}>
          <Icon name="sparkles" />
          <span style={{ flex: 1 }}><strong>{b.title}</strong> — {b.message}</span>
          {b.cta_label && b.cta_url && safeLink(b.cta_url) && (/^https?:/.test(b.cta_url)
            ? <a className="btn btn--outline btn--sm" href={b.cta_url} target="_blank" rel="noopener noreferrer">{b.cta_label}</a>
            : <a className="btn btn--outline btn--sm" href={b.cta_url}>{b.cta_label}</a>)}
        </div>
      ))}
      {announcements.map((a) => <DismissibleNotice key={a.id} id={a.id} title={a.title} message={a.message} />)}
    </div>
  );
}
