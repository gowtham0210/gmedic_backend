const db = require('../../db');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

// ---- Platform settings (booking window, hold time, etc.) -------------------

exports.getSettings = async (req, res) => {
  const rows = await db.query('SELECT * FROM platform_settings ORDER BY setting_key');
  res.json({ settings: rows.map((r) => ({ key: r.setting_key, value: JSON.parse(r.value), updatedAt: db.iso(r.updated_at) })) });
};

exports.updateSetting = async (req, res) => {
  const { key, value } = req.body || {};
  if (!key || value === undefined) throw badRequest('A setting key and value are required.');
  const before = await db.one('SELECT value FROM platform_settings WHERE setting_key = ?', [key]);
  await db.query(
    `INSERT INTO platform_settings (setting_key, value, updated_by) VALUES (?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by`,
    [key, JSON.stringify(value), req.user.id]
  );
  await auditLog.record({ req, action: 'SETTING_UPDATED', entityType: 'PLATFORM_SETTING', entityId: key, summary: `${key}: ${before ? before.value : '—'} → ${JSON.stringify(value)}`, previousValue: before ? JSON.parse(before.value) : null, newValue: value });
  res.json({ ok: true, message: `${key.replace(/_/g, ' ')} updated.` });
};

// ---- Feature flags -----------------------------------------------------------

exports.listFlags = async (req, res) => {
  const rows = await db.query(`SELECT f.*, h.name AS hospital_name FROM feature_flags f LEFT JOIN hospitals h ON h.id = f.hospital_id ORDER BY f.flag_key, f.scope_key`);
  res.json({ flags: rows.map((r) => ({ id: r.id, flagKey: r.flag_key, hospitalId: r.hospital_id, hospitalName: r.hospital_name, scopeKey: r.scope_key, enabled: !!r.enabled, updatedAt: db.iso(r.updated_at) })) });
};

exports.setFlag = async (req, res) => {
  const flag = await db.one('SELECT * FROM feature_flags WHERE id = ?', [req.params.id]);
  if (!flag) throw notFound('Feature flag not found.');
  const { enabled } = req.body || {};
  await db.query('UPDATE feature_flags SET enabled = ?, updated_by = ? WHERE id = ?', [enabled ? 1 : 0, req.user.id, req.params.id]);
  await auditLog.record({ req, action: 'FEATURE_FLAG_UPDATED', entityType: 'FEATURE_FLAG', entityId: String(req.params.id), summary: `${flag.flag_key} (${flag.scope_key}): ${flag.enabled ? 'on' : 'off'} → ${enabled ? 'on' : 'off'}` });
  res.json({ ok: true, message: 'Feature flag updated.' });
};

// ---- App version control ------------------------------------------------------

exports.listAppVersions = async (req, res) => {
  const rows = await db.query('SELECT * FROM app_versions');
  res.json({
    versions: rows.map((r) => ({
      platform: r.platform, currentVersion: r.current_version, minSupportedVersion: r.min_supported_version,
      latestVersion: r.latest_version, forceUpdate: !!r.force_update, updateMessage: r.update_message, updatedAt: db.iso(r.updated_at),
    })),
  });
};

exports.updateAppVersion = async (req, res) => {
  const platform = req.params.platform;
  const row = await db.one('SELECT * FROM app_versions WHERE platform = ?', [platform]);
  if (!row) throw notFound('Unknown platform.');
  const { minSupportedVersion, latestVersion, forceUpdate, updateMessage } = req.body || {};
  await db.query(
    'UPDATE app_versions SET min_supported_version = COALESCE(?, min_supported_version), latest_version = COALESCE(?, latest_version), force_update = ?, update_message = ?, updated_by = ? WHERE platform = ?',
    [minSupportedVersion || null, latestVersion || null, forceUpdate ? 1 : 0, updateMessage || null, req.user.id, platform]
  );
  await auditLog.record({ req, action: 'APP_VERSION_UPDATED', entityType: 'APP_VERSION', entityId: platform, summary: `${platform}: latest → ${latestVersion || row.latest_version}${forceUpdate ? ' (force update)' : ''}` });
  res.json({ ok: true, message: `${platform} version settings updated.` });
};
