// Writes database/schema.sql: the full DDL of the live database (tables, indexes, triggers),
// grouped by domain. Run: node scripts/export-ddl.js
const fs = require('fs');
const path = require('path');
const db = require('../db');

const GROUPS = [
  ['Hospitals, staff and QR', ['hospitals', 'hospital_rate_history', 'hospital_policies', 'hospital_branches', 'hospital_documents', 'feature_flags', 'departments', 'users', 'doctors', 'doctor_languages', 'doctor_schedules', 'doctor_leaves', 'qr_codes', 'qr_scans']],
  ['Patients and appointments', ['patients', 'patient_hospital_links', 'otp_codes', 'appointments', 'appointment_status_history', 'consultation_notes', 'slot_holds', 'tokens', 'token_counters']],
  ['Payments and settlements', ['payments', 'payment_webhooks', 'refunds', 'disputes', 'settlements', 'settlement_items', 'settlement_adjustments']],
  ['Support', ['support_tickets', 'support_messages']],
  ['Communications and compliance', ['notification_templates', 'notifications', 'notification_logs', 'user_notification_prefs', 'device_tokens', 'consent_records', 'announcements', 'announcement_hospitals', 'banners']],
  ['Platform', ['audit_logs', 'internal_notes', 'platform_settings', 'app_versions', 'sessions', 'meta']],
];

(async () => {
  const objects = await db.query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'");
  const tables = new Map(objects.filter((o) => o.type === 'table').map((o) => [o.name, o]));
  const listed = new Set(GROUPS.flatMap(([, names]) => names));
  const missing = [...tables.keys()].filter((n) => !listed.has(n));
  if (missing.length) GROUPS.push(['Other', missing]);

  const applied = JSON.parse(((await db.one("SELECT meta_value FROM meta WHERE meta_key = 'migrations_applied'")) || {}).meta_value || '[]');
  const last = applied.length ? applied[applied.length - 1].replace(/\.sql$/, '') : 'none';
  const out = [
    `-- Gmedic database schema (SQLite). Generated from the live database; last migration applied: ${last}.`,
    '-- Load into an empty database:  sqlite3 gmedic.sqlite < database/schema.sql',
    '-- The application itself builds the same schema from database/migrations (npm run db:setup).',
    '',
    'PRAGMA foreign_keys = OFF;',
    '',
  ];
  for (const [title, names] of GROUPS) {
    out.push(`-- ============================================================ ${title}`, '');
    for (const name of names) {
      const t = tables.get(name);
      if (!t) continue;
      out.push(`${t.sql.trim()};`, '');
      for (const o of objects.filter((x) => x.type === 'index' && x.tbl_name === name)) out.push(`${o.sql.trim()};`);
      for (const o of objects.filter((x) => x.type === 'trigger' && x.tbl_name === name)) out.push('', `${o.sql.trim()};`);
      out.push('');
    }
  }
  out.push('PRAGMA foreign_keys = ON;', '');
  const file = path.join(__dirname, '..', 'database', 'schema.sql');
  fs.writeFileSync(file, out.join('\n'));
  console.log(`${file}: ${tables.size} tables, ${objects.filter((o) => o.type === 'index').length} indexes, ${objects.filter((o) => o.type === 'trigger').length} triggers`);
})();
