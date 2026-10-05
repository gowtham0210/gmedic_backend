// Platform-level defaults and small sample datasets for pages that have no real
// data source yet (QR scan analytics, payment webhooks). Sample rows are
// flagged `is_sample = 1` so they are never mistaken for real activity and can
// be cleared with one query once a real source exists.

const db = require('./index');

const DEFAULT_SETTINGS = {
  booking_window_days: 14,
  appointment_hold_minutes: 10,
  cancellation_cutoff_hours: 2,
  no_show_grace_minutes: 15,
  refund_maker_checker_threshold: 2000,
};

const DEFAULT_FLAGS = ['live_queue', 'rotating_qr'];

async function seedPlatformSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query(
      'INSERT OR IGNORE INTO platform_settings (setting_key, value) VALUES (?, ?)',
      [key, JSON.stringify(value)]
    );
  }
}

async function seedAppVersions() {
  for (const platform of ['ANDROID', 'IOS']) {
    await db.query(
      `INSERT OR IGNORE INTO app_versions (platform, current_version, min_supported_version, latest_version, force_update, update_message)
       VALUES (?, '1.4.0', '1.2.0', '1.4.0', 0, NULL)`,
      [platform]
    );
  }
}

async function seedFeatureFlags() {
  for (const key of DEFAULT_FLAGS) {
    await db.query(
      "INSERT OR IGNORE INTO feature_flags (flag_key, hospital_id, enabled) VALUES (?, NULL, 0)",
      [key]
    );
  }
  const hospitals = await db.query('SELECT id FROM hospitals');
  for (const h of hospitals) {
    await db.query(
      "INSERT OR IGNORE INTO feature_flags (flag_key, hospital_id, enabled) VALUES ('live_queue', ?, 1)",
      [h.id]
    );
  }
}

async function seedNotificationTemplates() {
  const { EVENTS } = require('../config/notificationEvents');
  for (const [eventKey, event] of Object.entries(EVENTS)) {
    const exists = await db.one('SELECT id FROM notification_templates WHERE event_key = ?', [eventKey]);
    if (exists) continue;
    await db.query(
      `INSERT INTO notification_templates (id, event_key, name, title, body, channels) VALUES (?, ?, ?, ?, ?, '["IN_APP"]')`,
      [await db.nextId('notification_templates', 'TPL', 1), eventKey, event.name, event.title, event.body]
    );
  }
}

// Sample QR scan funnel + a few payment webhook rows, only if none exist yet.
async function seedSampleActivity() {
  const scanCount = await db.one('SELECT COUNT(*) AS n FROM qr_scans');
  if (Number(scanCount.n) === 0) {
    const qrCodes = await db.query('SELECT id, hospital_id FROM qr_codes');
    let n = 0;
    for (const qr of qrCodes) {
      const scans = 8 + Math.floor(Math.random() * 40);
      for (let i = 0; i < scans; i++) {
        const roll = Math.random();
        const result = roll < 0.86 ? 'LINKED' : roll < 0.95 ? 'ALREADY_LINKED' : 'FAILED';
        const daysAgo = Math.floor(Math.random() * 14);
        const hoursAgo = Math.floor(Math.random() * 24);
        await db.query(
          `INSERT INTO qr_scans (qr_code_id, hospital_id, result, failure_reason, is_sample, scanned_at)
           VALUES (?, ?, ?, ?, 1, datetime('now', '-' || ? || ' hours'))`,
          [qr.id, qr.hospital_id, result, result === 'FAILED' ? 'Expired QR image cache on device' : null, daysAgo * 24 + hoursAgo]
        );
        n++;
      }
    }
    console.log(`  seeded ${n} sample QR scan(s) across ${qrCodes.length} QR code(s)`);
  }

  const webhookCount = await db.one('SELECT COUNT(*) AS n FROM payment_webhooks');
  if (Number(webhookCount.n) === 0) {
    const payments = await db.query('SELECT id, transaction_id, status FROM payments ORDER BY created_at DESC LIMIT 30');
    let n = 0;
    for (const p of payments) {
      const failed = p.status === 'PAID' && Math.random() < 0.06;
      await db.query(
        `INSERT INTO payment_webhooks (gateway, event_type, transaction_id, payment_id, status, failure_reason, sync_status, retry_count, is_sample, received_at)
         VALUES ('SIMULATED', 'payment.captured', ?, ?, ?, ?, ?, ?, 1, datetime('now', '-' || ? || ' minutes'))`,
        [p.transaction_id, p.id, failed ? 'FAILED' : 'PROCESSED', failed ? 'Signature mismatch on retry' : null, failed ? 'PENDING' : 'NOT_REQUIRED', failed ? 1 : 0, Math.floor(Math.random() * 10000)]
      );
      n++;
    }
    console.log(`  seeded ${n} sample payment webhook event(s)`);
  }
}

async function seedPlatform() {
  await seedPlatformSettings();
  await seedAppVersions();
  await seedFeatureFlags();
  await seedNotificationTemplates();
  await seedSampleActivity();
}

module.exports = { seedPlatform, DEFAULT_SETTINGS };
