// What the mobile apps ask at start-up: is this build too old, or is a newer one available? The numbers are
// set by an admin (Platform Settings > App Versions).
const db = require('../../db');
const { fail } = require('./common');
const { SEMVER, compareVersions: cmpVersions } = require('../../utils/semver');

async function check({ platform, version }) {
  const p = String(platform || '').toUpperCase();
  const row = await db.one('SELECT * FROM app_versions WHERE platform = ?', [p]);
  if (!row) throw fail(422, 'UNKNOWN_PLATFORM', 'Platform must be ANDROID or IOS.');
  const v = String(version || '').trim();
  if (!SEMVER.test(v)) throw fail(422, 'INVALID_VERSION', 'Send the installed version as x.y.z, for example 1.3.0.');
  // `forceUpdate` makes the minimum binding: a build below it must update before it can be used.
  const belowMin = cmpVersions(v, row.min_supported_version) < 0;
  return {
    platform: p, version: v,
    latestVersion: row.latest_version, minSupportedVersion: row.min_supported_version,
    updateRequired: !!row.force_update && belowMin,
    updateAvailable: cmpVersions(v, row.latest_version) < 0,
    message: row.update_message || null,
  };
}

module.exports = { check };
