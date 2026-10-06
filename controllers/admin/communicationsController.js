const db = require('../../db');
const { roleHas } = require('../../config/permissions');
const { EVENTS, CHANNELS, invalidVariables } = require('../../config/notificationEvents');
const { validate } = require('../../utils/validate');
const { badRequest, notFound, forbidden } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

const need = (req, permission) => { if (!roleHas(req.user.role, permission)) throw forbidden(); };

// ---- Notification templates --------------------------------------------------

function templateFromRow(r) {
  const event = EVENTS[r.event_key];
  return {
    id: r.id, eventKey: r.event_key, name: r.name, title: r.title, body: r.body,
    channels: JSON.parse(r.channels || '[]'), status: r.status, updatedAt: db.iso(r.updated_at), updatedByName: r.updated_by_name || null,
    variables: event ? event.variables : [], audience: event ? event.audience : null, sample: event ? event.sample : {},
  };
}

// Shared by create and update: channels must be known, title/body present, and
// every {{variable}} must be one this event actually provides.
function checkTemplateInput(eventKey, { title, body, channels }) {
  const errors = {};
  if (!String(title || '').trim()) errors.title = 'Enter a title.';
  if (!String(body || '').trim()) errors.body = 'Enter the message.';
  if (!Array.isArray(channels) || !channels.length) errors.channels = 'Choose at least one channel.';
  else if (channels.some((c) => !CHANNELS[c])) errors.channels = 'Unknown channel.';
  const bad = invalidVariables(eventKey, title, body);
  if (bad.length) errors.body = `Unknown variable${bad.length > 1 ? 's' : ''} for this event: ${bad.map((v) => `{{${v}}}`).join(', ')}.`;
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
}

exports.listTemplates = async (req, res) => {
  const rows = await db.query(
    `SELECT t.*, u.name AS updated_by_name FROM notification_templates t LEFT JOIN users u ON u.id = t.updated_by ORDER BY t.name`
  );
  const used = new Set(rows.map((r) => r.event_key));
  res.json({
    templates: rows.map(templateFromRow),
    channels: Object.entries(CHANNELS).map(([key, c]) => ({ key, ...c })),
    unusedEvents: Object.entries(EVENTS).filter(([k]) => !used.has(k)).map(([k, e]) => ({ eventKey: k, name: e.name, variables: e.variables, sample: e.sample, title: e.title, body: e.body })),
  });
};

exports.createTemplate = async (req, res) => {
  const { eventKey, title, body, channels } = req.body || {};
  const event = EVENTS[eventKey];
  if (!event) throw badRequest('Choose a valid event.', { eventKey: 'Choose an event.' });
  if (await db.one('SELECT id FROM notification_templates WHERE event_key = ?', [eventKey])) throw badRequest('A template for this event already exists — edit it instead.');
  checkTemplateInput(eventKey, { title, body, channels });
  const id = await db.nextId('notification_templates', 'TPL', 1);
  await db.query(
    `INSERT INTO notification_templates (id, event_key, name, title, body, channels, status, updated_by) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    [id, eventKey, event.name, String(title).trim(), String(body).trim(), JSON.stringify(channels), req.user.id]
  );
  await auditLog.record({ req, action: 'TEMPLATE_CREATED', entityType: 'NOTIFICATION_TEMPLATE', entityId: id, summary: `Created template "${event.name}"`, newValue: { title, body, channels } });
  res.status(201).json({ ok: true, message: `${event.name} template created.`, id });
};

exports.updateTemplate = async (req, res) => {
  const row = await db.one('SELECT * FROM notification_templates WHERE id = ?', [req.params.id]);
  if (!row) throw notFound('Template not found.');
  const { title, body, channels } = req.body || {};
  checkTemplateInput(row.event_key, { title, body, channels });
  await db.query('UPDATE notification_templates SET title = ?, body = ?, channels = ?, updated_by = ? WHERE id = ?',
    [String(title).trim(), String(body).trim(), JSON.stringify(channels), req.user.id, row.id]);
  await auditLog.record({
    req, action: 'TEMPLATE_UPDATED', entityType: 'NOTIFICATION_TEMPLATE', entityId: row.id, summary: `Edited template "${row.name}"`,
    previousValue: { title: row.title, body: row.body, channels: JSON.parse(row.channels) }, newValue: { title: String(title).trim(), body: String(body).trim(), channels },
  });
  res.json({ ok: true, message: `${row.name} updated.` });
};

exports.setTemplateStatus = async (req, res) => {
  const row = await db.one('SELECT * FROM notification_templates WHERE id = ?', [req.params.id]);
  if (!row) throw notFound('Template not found.');
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose enabled or disabled.');
  need(req, status === 'ACTIVE' ? 'communications.templates.enable' : 'communications.templates.disable');
  await db.query('UPDATE notification_templates SET status = ?, updated_by = ? WHERE id = ?', [status, req.user.id, row.id]);
  await auditLog.record({ req, action: status === 'ACTIVE' ? 'TEMPLATE_ENABLED' : 'TEMPLATE_DISABLED', entityType: 'NOTIFICATION_TEMPLATE', entityId: row.id, summary: `${row.name}: ${row.status} → ${status}` });
  res.json({ ok: true, message: `${row.name} ${status === 'ACTIVE' ? 'enabled' : 'disabled'}.` });
};

exports.notificationLogs = async (req, res) => {
  const { status, eventKey, page = 1, pageSize = 25 } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('l.status = ?'); params.push(status); }
  if (eventKey) { clauses.push('l.event_key = ?'); params.push(eventKey); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM notification_logs l ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(
    `SELECT l.*, u.name AS recipient_name FROM notification_logs l LEFT JOIN users u ON u.id = l.recipient_user_id ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (cur - 1) * size]
  );
  res.json({
    items: rows.map((l) => ({
      id: l.id, eventKey: l.event_key, eventName: EVENTS[l.event_key] ? EVENTS[l.event_key].name : l.event_key, recipientName: l.recipient_name, recipientRole: l.recipient_role,
      channel: l.channel, status: l.status, failureReason: l.failure_reason, createdAt: db.iso(l.created_at),
    })),
    total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
  });
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
  await db.query("INSERT INTO announcements (id, title, message, target, status, created_by) VALUES (?, ?, ?, 'ALL', 'DRAFT', ?)", [id, value.title, value.message, req.user.id]);
  await auditLog.record({ req, action: 'ANNOUNCEMENT_CREATED', entityType: 'ANNOUNCEMENT', entityId: id, summary: `Drafted announcement: ${value.title}` });
  res.status(201).json({ ok: true, message: 'Announcement saved as draft.', id });
};

exports.setAnnouncementStatus = async (req, res) => {
  const ann = await db.one('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!ann) throw notFound('Announcement not found.');
  const { status } = req.body || {};
  if (!['PUBLISHED', 'ARCHIVED'].includes(status)) throw badRequest('Choose Publish or Archive.');
  need(req, status === 'PUBLISHED' ? 'communications.announcements.publish' : 'communications.announcements.archive');
  if (ann.status === status) throw badRequest(`This announcement is already ${status.toLowerCase()}.`);
  if (status === 'PUBLISHED' && ann.status === 'ARCHIVED') throw badRequest('Archived announcements can\'t be published again — create a new one.');
  const publishedAt = status === 'PUBLISHED' && !ann.published_at ? "datetime('now')" : 'published_at';
  await db.query(`UPDATE announcements SET status = ?, published_at = ${publishedAt} WHERE id = ?`, [status, req.params.id]);
  await auditLog.record({ req, action: `ANNOUNCEMENT_${status}`, entityType: 'ANNOUNCEMENT', entityId: req.params.id, summary: `${ann.title}: ${ann.status} → ${status}` });
  res.json({ ok: true, message: status === 'PUBLISHED' ? 'Published — it now shows in the Doctor and Receptionist portals.' : 'Announcement archived.' });
};

// ---- Banners --------------------------------------------------------------------

function bannerFromRow(r) {
  return { id: r.id, title: r.title, message: r.message, ctaLabel: r.cta_label, ctaUrl: r.cta_url, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, createdAt: db.iso(r.created_at) };
}

function checkBanner(body) {
  const { value, errors, ok } = validate(body, {
    title: { label: 'Title', required: true, minLength: 3, maxLength: 160 },
    message: { label: 'Description', required: true, minLength: 5, maxLength: 300 },
    ctaLabel: { label: 'Button label', maxLength: 40 },
    ctaUrl: { label: 'Button link', maxLength: 300 },
  });
  if (value.ctaUrl && !/^(https?:\/\/|\/)/.test(value.ctaUrl)) errors.ctaUrl = 'Use a full https:// link or a path like /doctor/schedule.';
  if (value.ctaUrl && !value.ctaLabel) errors.ctaLabel = 'Add a button label for the link.';
  if (!ok || Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
  return value;
}

exports.listBanners = async (req, res) => {
  const rows = await db.query('SELECT * FROM banners ORDER BY created_at DESC');
  res.json({ banners: rows.map(bannerFromRow) });
};

exports.createBanner = async (req, res) => {
  const v = checkBanner(req.body);
  const id = await db.nextId('banners', 'BNR', 1);
  await db.query(
    `INSERT INTO banners (id, title, message, cta_label, cta_url, starts_at, status, created_by) VALUES (?, ?, ?, ?, ?, datetime('now'), 'INACTIVE', ?)`,
    [id, v.title, v.message, v.ctaLabel || null, v.ctaUrl || null, req.user.id]
  );
  await auditLog.record({ req, action: 'BANNER_CREATED', entityType: 'BANNER', entityId: id, summary: `Created banner: ${v.title}` });
  res.status(201).json({ ok: true, message: 'Banner created (inactive until you activate it).', id });
};

exports.updateBanner = async (req, res) => {
  const banner = await db.one('SELECT * FROM banners WHERE id = ?', [req.params.id]);
  if (!banner) throw notFound('Banner not found.');
  const v = checkBanner(req.body);
  await db.query('UPDATE banners SET title = ?, message = ?, cta_label = ?, cta_url = ? WHERE id = ?', [v.title, v.message, v.ctaLabel || null, v.ctaUrl || null, banner.id]);
  await auditLog.record({ req, action: 'BANNER_UPDATED', entityType: 'BANNER', entityId: banner.id, summary: `Edited banner: ${v.title}`, previousValue: { title: banner.title, message: banner.message }, newValue: { title: v.title, message: v.message } });
  res.json({ ok: true, message: 'Banner updated.' });
};

exports.setBannerStatus = async (req, res) => {
  const banner = await db.one('SELECT * FROM banners WHERE id = ?', [req.params.id]);
  if (!banner) throw notFound('Banner not found.');
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose Active or Inactive.');
  need(req, status === 'ACTIVE' ? 'communications.banners.activate' : 'communications.banners.deactivate');
  await db.query('UPDATE banners SET status = ? WHERE id = ?', [status, req.params.id]);
  await auditLog.record({ req, action: 'BANNER_STATUS_CHANGED', entityType: 'BANNER', entityId: req.params.id, summary: `${banner.title}: ${banner.status} → ${status}` });
  res.json({ ok: true, message: `Banner ${status === 'ACTIVE' ? 'activated' : 'deactivated'}.` });
};
