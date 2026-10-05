import Link from 'next/link';
import db from '../../db';
import Icon from '../Icon';

// Published announcements and active banners (managed under Super Admin ->
// Communications), shown at the top of the Doctor and Receptionist portals.
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
          {b.cta_label && b.cta_url && (/^https?:/.test(b.cta_url)
            ? <a className="btn btn--outline btn--sm" href={b.cta_url} target="_blank" rel="noopener noreferrer">{b.cta_label}</a>
            : <Link className="btn btn--outline btn--sm" href={b.cta_url}>{b.cta_label}</Link>)}
        </div>
      ))}
      {announcements.map((a) => (
        <div key={a.id} className="alert alert--info" style={{ background: 'var(--amber-50)', borderColor: 'var(--amber-700)', color: 'var(--amber-700)' }}>
          <Icon name="megaphone" />
          <span><strong>{a.title}</strong> — {a.message}</span>
        </div>
      ))}
    </div>
  );
}
