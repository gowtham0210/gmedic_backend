const db = require('../../db');
const { roleHas } = require('../../config/permissions');
const { EVENTS, CHANNELS, isCritical, invalidVariables } = require('../../config/notificationEvents');
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
    variables: event ? event.variables : [], audience: event ? event.audience : null, sample: event ? event.sample : {}, critical: isCritical(r.event_key),
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

// How many people an announcement reaches: the active doctors and receptionists of the hospitals it targets.
async function audienceOf(target, hospitalIds) {
  const scoped = target === 'SELECTED';
  const where = scoped ? `AND hospital_id IN (${hospitalIds.map(() => '?').join(',') || "''"})` : '';
  const rows = await db.query(`SELECT role, COUNT(*) AS n FROM users WHERE status = 'ACTIVE' AND role IN ('DOCTOR', 'RECEPTIONIST') ${where} GROUP BY role`, scoped ? hospitalIds : []);
  const n = (role) => Number((rows.find((r) => r.role === role) || {}).n) || 0;
  const hospitals = scoped ? hospitalIds.length : Number((await db.one("SELECT COUNT(*) AS n FROM hospitals WHERE status <> 'OFFBOARDED'")).n);
  return { doctors: n('DOCTOR'), receptionists: n('RECEPTIONIST'), hospitals };
}

async function announcementJson(r) {
  const hospitals = r.target === 'SELECTED'
    ? await db.query('SELECT h.id, h.name FROM announcement_hospitals a JOIN hospitals h ON h.id = a.hospital_id WHERE a.announcement_id = ? ORDER BY h.name', [r.id])
    : [];
  return {
    id: r.id, title: r.title, message: r.message, target: r.target, status: r.status, publishedAt: db.iso(r.published_at), createdAt: db.iso(r.created_at),
    hospitals: hospitals.map((h) => ({ id: h.id, name: h.name })), audience: await audienceOf(r.target, hospitals.map((h) => h.id)),
  };
}

exports.listAnnouncements = async (req, res) => {
  const rows = await db.query('SELECT * FROM announcements ORDER BY created_at DESC');
  res.json({ announcements: await Promise.all(rows.map(announcementJson)) });
};

// Title, message and who it reaches: every hospital, or a chosen set (target SELECTED + hospitalIds).
async function checkAnnouncement(body) {
  const { value, errors, ok } = validate(body, {
    title: { label: 'Title', required: true, minLength: 3, maxLength: 160 },
    message: { label: 'Message', required: true, minLength: 5, maxLength: 1000 },
  });
  const target = (body && body.target) === 'SELECTED' ? 'SELECTED' : 'ALL';
  let hospitalIds = [];
  if (target === 'SELECTED') {
    hospitalIds = [...new Set(Array.isArray(body.hospitalIds) ? body.hospitalIds.map(String) : [])];
    if (!hospitalIds.length) errors.hospitalIds = 'Choose at least one hospital.';
    else {
      const found = await db.query(`SELECT id FROM hospitals WHERE id IN (${hospitalIds.map(() => '?').join(',')})`, hospitalIds);
      if (found.length !== hospitalIds.length) errors.hospitalIds = 'One of the chosen hospitals does not exist.';
    }
  }
  if (!ok || Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
  return { ...value, target, hospitalIds };
}

async function saveTargets(conn, id, target, hospitalIds) {
  await conn.query('DELETE FROM announcement_hospitals WHERE announcement_id = ?', [id]);
  if (target === 'SELECTED') for (const hid of hospitalIds) await conn.query('INSERT INTO announcement_hospitals (announcement_id, hospital_id) VALUES (?, ?)', [id, hid]);
}

exports.createAnnouncement = async (req, res) => {
  const v = await checkAnnouncement(req.body);
  const id = await db.nextId('announcements', 'ANN', 1);
  await db.tx(async (conn) => {
    await conn.query("INSERT INTO announcements (id, title, message, target, status, created_by) VALUES (?, ?, ?, ?, 'DRAFT', ?)", [id, v.title, v.message, v.target, req.user.id]);
    await saveTargets(conn, id, v.target, v.hospitalIds);
  });
  await auditLog.record({ req, action: 'ANNOUNCEMENT_CREATED', entityType: 'ANNOUNCEMENT', entityId: id, summary: `Drafted announcement: ${v.title}${v.target === 'SELECTED' ? ` (${v.hospitalIds.length} hospital${v.hospitalIds.length === 1 ? '' : 's'})` : ''}` });
  res.status(201).json({ ok: true, message: 'Announcement saved as draft.', id });
};

// PATCH /api/admin/communications/announcements/:id: a draft can be corrected; a published one can't (people have read it).
exports.updateAnnouncement = async (req, res) => {
  const ann = await db.one('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!ann) throw notFound('Announcement not found.');
  if (ann.status !== 'DRAFT') throw badRequest('Only a draft can be edited. Published and archived announcements are a record of what was shown.');
  const v = await checkAnnouncement(req.body);
  await db.tx(async (conn) => {
    await conn.query("UPDATE announcements SET title = ?, message = ?, target = ? WHERE id = ? AND status = 'DRAFT'", [v.title, v.message, v.target, ann.id]);
    await saveTargets(conn, ann.id, v.target, v.hospitalIds);
  });
  await auditLog.record({ req, action: 'ANNOUNCEMENT_UPDATED', entityType: 'ANNOUNCEMENT', entityId: ann.id, summary: `Edited draft: ${v.title}`, previousValue: { title: ann.title, message: ann.message, target: ann.target }, newValue: { title: v.title, message: v.message, target: v.target, hospitalIds: v.hospitalIds } });
  res.json({ ok: true, message: 'Draft updated.' });
};

// DELETE /api/admin/communications/announcements/:id: discards a draft that was never published (nobody has seen it).
exports.discardAnnouncement = async (req, res) => {
  const ann = await db.one('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!ann) throw notFound('Announcement not found.');
  if (ann.status !== 'DRAFT' || ann.published_at) throw badRequest('Only a draft that was never published can be discarded. Archive a published one instead.');
  await db.query("DELETE FROM announcements WHERE id = ? AND status = 'DRAFT' AND published_at IS NULL", [ann.id]);
  await auditLog.record({ req, action: 'ANNOUNCEMENT_DISCARDED', entityType: 'ANNOUNCEMENT', entityId: ann.id, summary: `Discarded draft: ${ann.title}`, previousValue: { title: ann.title, message: ann.message } });
  res.json({ ok: true, message: 'Draft discarded.' });
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
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  // What a person would see right now: Live, Scheduled (starts later), Ended, or the stored status.
  let state = r.status === 'ACTIVE' ? 'LIVE' : r.status;
  if (r.status === 'ACTIVE' && r.starts_at > now) state = 'SCHEDULED';
  if (r.status === 'ACTIVE' && r.ends_at && r.ends_at < now) state = 'ENDED';
  return { id: r.id, title: r.title, message: r.message, ctaLabel: r.cta_label, ctaUrl: r.cta_url, startsAt: db.iso(r.starts_at), endsAt: db.iso(r.ends_at), status: r.status, state, createdAt: db.iso(r.created_at) };
}

// A banner link must stay inside the portal ("/doctor/schedule") or be a full https:// address. Protocol-relative
// ("//other-site.com"), plain http:// and anything else could send people to another site.
const SAFE_PATH = /^\/(?![/\\])[^\s\\]*$/;
const SAFE_HTTPS = /^https:\/\/[^\s/\\]+(?:[/?#][^\s\\]*)?$/i;
const sqlTime = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : db.toSql(d); };

function checkBanner(body) {
  const { value, errors, ok } = validate(body, {
    title: { label: 'Title', required: true, minLength: 3, maxLength: 160 },
    message: { label: 'Description', required: true, minLength: 5, maxLength: 300 },
    ctaLabel: { label: 'Button label', maxLength: 40 },
    ctaUrl: { label: 'Button link', maxLength: 300 },
  });
  if (value.ctaUrl && !SAFE_PATH.test(value.ctaUrl) && !SAFE_HTTPS.test(value.ctaUrl)) errors.ctaUrl = 'Use a full https:// link, or a path inside the portal like /doctor/schedule.';
  if (value.ctaUrl && !value.ctaLabel) errors.ctaLabel = 'Add a button label for the link.';
  // Schedule: starts now unless a start is given; an end is optional but must come after the start and not be past.
  const startsAt = body && body.startsAt ? sqlTime(body.startsAt) : null;
  const endsAt = body && body.endsAt ? sqlTime(body.endsAt) : null;
  if (body && body.startsAt && !startsAt) errors.startsAt = 'Enter a valid start.';
  if (body && body.endsAt && !endsAt) errors.endsAt = 'Enter a valid end.';
  if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = 'The end must be after the start.';
  if (endsAt && endsAt <= db.toSql(new Date())) errors.endsAt = 'The end is already in the past.';
  if (!ok || Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
  return { ...value, startsAt, endsAt };
}

exports.listBanners = async (req, res) => {
  const rows = await db.query("SELECT * FROM banners ORDER BY status = 'ARCHIVED', created_at DESC");
  res.json({ banners: rows.map(bannerFromRow) });
};

exports.createBanner = async (req, res) => {
  const v = checkBanner(req.body);
  const id = await db.nextId('banners', 'BNR', 1);
  await db.query(
    `INSERT INTO banners (id, title, message, cta_label, cta_url, starts_at, ends_at, status, created_by) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, 'INACTIVE', ?)`,
    [id, v.title, v.message, v.ctaLabel || null, v.ctaUrl || null, v.startsAt, v.endsAt, req.user.id]
  );
  await auditLog.record({ req, action: 'BANNER_CREATED', entityType: 'BANNER', entityId: id, summary: `Created banner: ${v.title}` });
  res.status(201).json({ ok: true, message: 'Banner created (inactive until you activate it).', id });
};

exports.updateBanner = async (req, res) => {
  const banner = await db.one('SELECT * FROM banners WHERE id = ?', [req.params.id]);
  if (!banner) throw notFound('Banner not found.');
  if (banner.status === 'ARCHIVED') throw badRequest('An archived banner can\'t be edited.');
  const v = checkBanner(req.body);
  await db.query("UPDATE banners SET title = ?, message = ?, cta_label = ?, cta_url = ?, starts_at = COALESCE(?, starts_at), ends_at = ? WHERE id = ?", [v.title, v.message, v.ctaLabel || null, v.ctaUrl || null, v.startsAt, v.endsAt, banner.id]);
  await auditLog.record({ req, action: 'BANNER_UPDATED', entityType: 'BANNER', entityId: banner.id, summary: `Edited banner: ${v.title}`, previousValue: { title: banner.title, message: banner.message, startsAt: banner.starts_at, endsAt: banner.ends_at }, newValue: { title: v.title, message: v.message, startsAt: v.startsAt, endsAt: v.endsAt } });
  res.json({ ok: true, message: 'Banner updated.' });
};

exports.setBannerStatus = async (req, res) => {
  const banner = await db.one('SELECT * FROM banners WHERE id = ?', [req.params.id]);
  if (!banner) throw notFound('Banner not found.');
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) throw badRequest('Choose Active, Inactive or Archived.');
  need(req, status === 'ACTIVE' ? 'communications.banners.activate' : 'communications.banners.deactivate');
  if (banner.status === 'ARCHIVED') throw badRequest('An archived banner can\'t be changed. Create a new one.');
  if (banner.status === status) throw badRequest(`This banner is already ${status.toLowerCase()}.`);
  if (status === 'ACTIVE' && banner.ends_at && banner.ends_at <= db.toSql(new Date())) throw badRequest('This banner\'s end date has passed. Edit the dates before activating it.');
  await db.query('UPDATE banners SET status = ? WHERE id = ?', [status, req.params.id]);
  await auditLog.record({ req, action: status === 'ARCHIVED' ? 'BANNER_ARCHIVED' : 'BANNER_STATUS_CHANGED', entityType: 'BANNER', entityId: req.params.id, summary: `${banner.title}: ${banner.status} → ${status}` });
  res.json({ ok: true, message: status === 'ARCHIVED' ? 'Banner archived.' : `Banner ${status === 'ACTIVE' ? 'activated' : 'deactivated'}.` });
};
