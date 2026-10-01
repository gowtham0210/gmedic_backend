const db = require('../../db');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

// ---- Notification templates --------------------------------------------------

exports.listTemplates = async (req, res) => {
  const rows = await db.query('SELECT * FROM notification_templates ORDER BY channel, code');
  res.json({
    templates: rows.map((r) => ({ id: r.id, channel: r.channel, code: r.code, name: r.name, title: r.title, body: r.body, status: r.status, updatedAt: db.iso(r.updated_at) })),
  });
};

exports.updateTemplate = async (req, res) => {
  const template = await db.one('SELECT * FROM notification_templates WHERE id = ?', [req.params.id]);
  if (!template) throw notFound('Template not found.');
  const { value, errors, ok } = validate(req.body, {
    title: { label: 'Title', maxLength: 120 },
    body: { label: 'Body', required: true, minLength: 5, maxLength: 500 },
  }, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const status = ['ACTIVE', 'INACTIVE'].includes(req.body.status) ? req.body.status : template.status;
  await db.query('UPDATE notification_templates SET title = COALESCE(?, title), body = COALESCE(?, body), status = ?, updated_by = ? WHERE id = ?', [value.title ?? null, value.body ?? null, status, req.user.id, req.params.id]);
  await auditLog.record({ req, action: 'TEMPLATE_UPDATED', entityType: 'NOTIFICATION_TEMPLATE', entityId: req.params.id, summary: `Updated template ${template.name}` });
  res.json({ ok: true, message: `${template.name} updated.` });
};

// ---- Announcements ------------------------------------------------------------

exports.listAnnouncements = async (req, res) => {
  const rows = await db.query('SELECT * FROM announcements ORDER BY created_at DESC');
  res.json({
    announcements: rows.map((r) => ({ id: r.id, title: r.title, message: r.message, target: r.target, status: r.status, publishedAt: db.iso(r.published_at), createdAt: db.iso(r.created_at) })),
  });
};

exports.createAnnouncement = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    title: { label: 'Title', required: true, minLength: 3, maxLength: 160 },
    message: { label: 'Message', required: true, minLength: 5, maxLength: 1000 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const id = await db.nextId('announcements', 'ANN', 1);
  await db.query('INSERT INTO announcements (id, title, message, target, status, created_by) VALUES (?, ?, ?, \'ALL\', \'DRAFT\', ?)', [id, value.title, value.message, req.user.id]);
  await auditLog.record({ req, action: 'ANNOUNCEMENT_CREATED', entityType: 'ANNOUNCEMENT', entityId: id, summary: `Drafted announcement: ${value.title}` });
  res.status(201).json({ ok: true, message: 'Announcement drafted.', id });
};

exports.publishAnnouncement = async (req, res) => {
  const ann = await db.one('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!ann) throw notFound('Announcement not found.');
  const { status } = req.body || {};
  if (!['PUBLISHED', 'ARCHIVED'].includes(status)) throw badRequest('Choose Publish or Archive.');
  const publishedAt = status === 'PUBLISHED' && !ann.published_at ? "datetime('now')" : 'published_at';
  await db.query(`UPDATE announcements SET status = ?, published_at = ${publishedAt} WHERE id = ?`, [status, req.params.id]);
  await auditLog.record({ req, action: `ANNOUNCEMENT_${status}`, entityType: 'ANNOUNCEMENT', entityId: req.params.id, summary: `${ann.title}: ${ann.status} → ${status}` });
  res.json({ ok: true, message: `Announcement ${status.toLowerCase()}.` });
};

// ---- Banners --------------------------------------------------------------------

exports.listBanners = async (req, res) => {
  const rows = await db.query('SELECT * FROM banners ORDER BY created_at DESC');
  res.json({
    banners: rows.map((r) => ({ id: r.id, title: r.title, message: r.message, ctaLabel: r.cta_label, ctaUrl: r.cta_url, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, createdAt: db.iso(r.created_at) })),
  });
};

exports.createBanner = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    title: { label: 'Title', required: true, minLength: 3, maxLength: 160 },
    message: { label: 'Message', required: true, minLength: 5, maxLength: 300 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const id = await db.nextId('banners', 'BNR', 1);
  await db.query(
    `INSERT INTO banners (id, title, message, cta_label, cta_url, starts_at, status, created_by) VALUES (?, ?, ?, ?, ?, datetime('now'), 'ACTIVE', ?)`,
    [id, value.title, value.message, req.body.ctaLabel || null, req.body.ctaUrl || null, req.user.id]
  );
  await auditLog.record({ req, action: 'BANNER_CREATED', entityType: 'BANNER', entityId: id, summary: `Created banner: ${value.title}` });
  res.status(201).json({ ok: true, message: 'Banner created.', id });
};

exports.setBannerStatus = async (req, res) => {
  const banner = await db.one('SELECT * FROM banners WHERE id = ?', [req.params.id]);
  if (!banner) throw notFound('Banner not found.');
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose Active or Inactive.');
  await db.query('UPDATE banners SET status = ? WHERE id = ?', [status, req.params.id]);
  await auditLog.record({ req, action: 'BANNER_STATUS_CHANGED', entityType: 'BANNER', entityId: req.params.id, summary: `${banner.title}: ${banner.status} → ${status}` });
  res.json({ ok: true, message: `Banner ${status.toLowerCase()}.` });
};
