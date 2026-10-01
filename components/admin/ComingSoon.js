import Icon from '../Icon';

// Placeholder for admin sections whose backend (controllers/admin/*.js, the
// database tables, RBAC + audit logging) is already built, but whose Next.js
// page UI isn't written yet. Kept as a real, RBAC-protected page (not a 404)
// so the sidebar is fully navigable while the rest of the UI is built.
export default function ComingSoon({ title, description }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="card">
        <div className="empty">
          <div className="empty__icon"><Icon name="clipboard-list" /></div>
          <h3>Page not built yet</h3>
          <p>This section of the Super Admin portal hasn&apos;t been built yet.</p>
        </div>
      </div>
    </>
  );
}
