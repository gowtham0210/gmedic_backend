const db = require('../../db');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

// ---- Platform settings (booking window, hold time, etc.) -------------------

const { SETTINGS } = require('../../config/platformSettings');

// GET /api/admin/settings: every known setting with its current value (or its default) and its limits.
exports.getSettings = async (req, res) => {
  const rows = await db.query('SELECT * FROM platform_settings');
  const stored = new Map(rows.map((r) => [r.setting_key, r]));
  res.json({
    settings: Object.entries(SETTINGS).map(([key, def]) => {
      const row = stored.get(key);
      let value = def.default;
      if (row) { try { value = JSON.parse(row.value); } catch { value = def.default; } }
      return { key, value, label: def.label, unit: def.unit, min: def.min, max: def.max, help: def.help, default: def.default, isDefault: !row, updatedAt: row ? db.iso(row.updated_at) : null };
    }),
  });
};

// PUT /api/admin/settings { key, value }: only a known key, a whole number inside its range.
exports.updateSetting = async (req, res) => {
  const { key, value } = req.body || {};
  const def = SETTINGS[key];
  if (!def) throw badRequest('That is not a platform setting.');
  const raw = typeof value === 'string' ? value.trim() : value;
  const n = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(n)) throw badRequest(`${def.label} must be a whole number.`, { value: 'Enter a whole number.' });
  if (n < def.min || n > def.max) throw badRequest(`${def.label} must be between ${def.min} and ${def.max}.`, { value: `Enter ${def.min} to ${def.max}.` });
  const before = await db.one('SELECT value FROM platform_settings WHERE setting_key = ?', [key]);
  if (before && JSON.parse(before.value) === n) return res.json({ ok: true, message: 'No changes to save.' });
  await db.tx(async (conn) => {
    await conn.query(
      `INSERT INTO platform_settings (setting_key, value, updated_by) VALUES (?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by`,
      [key, JSON.stringify(n), req.user.id]
    );
    // hospitals.booking_fee mirrors the booking token for every hospital (migration 031).
    if (key === 'booking_token_amount') await conn.query("UPDATE hospitals SET booking_fee = ?, booking_model = 'TOKEN', convenience_fee = 0", [n]);
  });
  await auditLog.record({ req, action: 'SETTING_UPDATED', entityType: 'PLATFORM_SETTING', entityId: key, summary: `${def.label}: ${before ? before.value : `${def.default} (default)`} → ${n}`, previousValue: before ? JSON.parse(before.value) : def.default, newValue: n });
  res.json({ ok: true, message: `${def.label} updated.` });
};

// ---- Feature flags -----------------------------------------------------------

const { FLAGS } = require('../../config/featureFlags');

// GET /api/admin/feature-flags: the known flags (what they do, whether anything is built behind them), their
// platform default and any per-hospital overrides.
exports.listFlags = async (req, res) => {
  const rows = await db.query('SELECT f.*, h.name AS hospital_name FROM feature_flags f LEFT JOIN hospitals h ON h.id = f.hospital_id ORDER BY f.flag_key, h.name');
  const flags = Object.entries(FLAGS).map(([key, def]) => {
    const mine = rows.filter((r) => r.flag_key === key);
    const platform = mine.find((r) => !r.hospital_id);
    return {
      flagKey: key, label: def.label, description: def.description, implemented: def.implemented,
      platformEnabled: platform ? !!platform.enabled : !!def.default, platformId: platform ? platform.id : null,
      overrides: mine.filter((r) => r.hospital_id).map((r) => ({ id: r.id, hospitalId: r.hospital_id, hospitalName: r.hospital_name, enabled: !!r.enabled })),
    };
  });
  const unknown = rows.filter((r) => !FLAGS[r.flag_key]).map((r) => ({ id: r.id, flagKey: r.flag_key, hospitalName: r.hospital_name, enabled: !!r.enabled }));
  res.json({ flags, unknown });
};

// POST /api/admin/feature-flags { flagKey, hospitalId?, enabled }: sets the platform default (no hospitalId) or one hospital's override.
exports.setFlag = async (req, res) => {
  const { flagKey, hospitalId, enabled } = req.body || {};
  const def = FLAGS[flagKey];
  if (!def) throw badRequest('That is not a known feature flag.');
  if (typeof enabled !== 'boolean') throw badRequest('Choose on or off.');
  if (!def.implemented && enabled) throw badRequest(`${def.label} is not available yet, so it can't be turned on.`);
  let hospital = null;
  if (hospitalId) {
    hospital = await db.one('SELECT id, name FROM hospitals WHERE id = ?', [hospitalId]);
    if (!hospital) throw badRequest('Choose a valid hospital.', { hospitalId: 'Choose a hospital.' });
  }
  const before = await db.one('SELECT * FROM feature_flags WHERE flag_key = ? AND scope_key = ?', [flagKey, hospital ? hospital.id : '*']);
  if (before && !!before.enabled === enabled) return res.json({ ok: true, message: 'No changes to save.' });
  await db.query(
    `INSERT INTO feature_flags (flag_key, hospital_id, enabled, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (flag_key, scope_key) DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by`,
    [flagKey, hospital ? hospital.id : null, enabled ? 1 : 0, req.user.id]
  );
  const scope = hospital ? hospital.name : 'the platform default';
  await auditLog.record({ req, action: 'FEATURE_FLAG_UPDATED', entityType: 'FEATURE_FLAG', entityId: `${flagKey}:${hospital ? hospital.id : '*'}`, summary: `${def.label} for ${scope}: ${before ? (before.enabled ? 'on' : 'off') : 'off (default)'} → ${enabled ? 'on' : 'off'}` });
  res.json({ ok: true, message: `${def.label} is ${enabled ? 'on' : 'off'} for ${scope}.` });
};

// DELETE /api/admin/feature-flags/:id: removes a hospital's override so it follows the platform default again.
exports.removeOverride = async (req, res) => {
  const row = await db.one('SELECT f.*, h.name AS hospital_name FROM feature_flags f LEFT JOIN hospitals h ON h.id = f.hospital_id WHERE f.id = ?', [req.params.id]);
  if (!row) throw notFound('Override not found.');
  if (!row.hospital_id) throw badRequest('The platform default can\'t be removed. Turn it off instead.');
  await db.query('DELETE FROM feature_flags WHERE id = ?', [row.id]);
  const def = FLAGS[row.flag_key];
  await auditLog.record({ req, action: 'FEATURE_FLAG_OVERRIDE_REMOVED', entityType: 'FEATURE_FLAG', entityId: `${row.flag_key}:${row.hospital_id}`, summary: `${def ? def.label : row.flag_key}: removed the override for ${row.hospital_name}` });
  res.json({ ok: true, message: `${row.hospital_name} follows the platform default again.` });
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

const { SEMVER, compareVersions: cmp } = require('../../utils/semver');

// PUT /api/admin/app-versions/:platform { minSupportedVersion?, latestVersion?, forceUpdate?, updateMessage? }
// Only the fields sent change, so saving one never resets the others. Versions are x.y.z and the minimum can't
// be above the latest.
exports.updateAppVersion = async (req, res) => {
  const platform = req.params.platform;
  const row = await db.one('SELECT * FROM app_versions WHERE platform = ?', [platform]);
  if (!row) throw notFound('Unknown platform.');
  const body = req.body || {};
  const errors = {};
  const min = body.minSupportedVersion !== undefined ? String(body.minSupportedVersion).trim() : row.min_supported_version;
  const latest = body.latestVersion !== undefined ? String(body.latestVersion).trim() : row.latest_version;
  if (!SEMVER.test(min)) errors.minSupportedVersion = 'Use a version like 1.4.0.';
  if (!SEMVER.test(latest)) errors.latestVersion = 'Use a version like 1.4.0.';
  if (!errors.minSupportedVersion && !errors.latestVersion && cmp(min, latest) > 0) errors.minSupportedVersion = 'The minimum version can\'t be above the latest.';
  let message = row.update_message;
  if (body.updateMessage !== undefined) { message = String(body.updateMessage || '').trim() || null; if (message && message.length > 300) errors.updateMessage = 'Keep it under 300 characters.'; }
  const force = body.forceUpdate !== undefined ? (body.forceUpdate ? 1 : 0) : row.force_update;
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
  if (min === row.min_supported_version && latest === row.latest_version && force === row.force_update && message === row.update_message) return res.json({ ok: true, message: 'No changes to save.' });
  await db.query('UPDATE app_versions SET min_supported_version = ?, latest_version = ?, force_update = ?, update_message = ?, updated_by = ? WHERE platform = ?', [min, latest, force, message, req.user.id, platform]);
  await auditLog.record({
    req, action: 'APP_VERSION_UPDATED', entityType: 'APP_VERSION', entityId: platform,
    summary: `${platform}: minimum ${row.min_supported_version} → ${min}, latest ${row.latest_version} → ${latest}${force ? ', force update on' : ', force update off'}`,
    previousValue: { min: row.min_supported_version, latest: row.latest_version, forceUpdate: !!row.force_update }, newValue: { min, latest, forceUpdate: !!force },
  });
  res.json({ ok: true, message: `${platform} version settings updated.` });
};
