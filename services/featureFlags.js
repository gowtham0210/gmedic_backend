// Is a feature turned on for a hospital? Use this wherever a flag changes behaviour:
//   if (await featureFlags.isEnabled('live_queue', hospitalId)) { ... }
const db = require('../db');
const { FLAGS } = require('../config/featureFlags');

async function isEnabled(flagKey, hospitalId) {
  const rows = await db.query('SELECT hospital_id, enabled FROM feature_flags WHERE flag_key = ? AND (scope_key = ? OR scope_key = ?)', [flagKey, '*', String(hospitalId || '*')]);
  const own = hospitalId ? rows.find((r) => r.hospital_id === hospitalId) : null;
  if (own) return !!own.enabled;
  const platform = rows.find((r) => !r.hospital_id);
  if (platform) return !!platform.enabled;
  return !!(FLAGS[flagKey] && FLAGS[flagKey].default);
}

module.exports = { isEnabled };
