const db = require('../../db');
const paymentModel = require('../../models/paymentModel');
const { notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

exports.list = async (req, res) => {
  const { hospitalId, doctorId, from, to, status, q, page, pageSize } = req.query;
  res.json(await paymentModel.adminSearch({ hospitalId, doctorId, from, to, status, q, page, pageSize }));
};

// Payment gateway webhook inbox. No live gateway is connected yet, so this
// reads the sample/imported rows seeded by `npm run db:setup`; the schema and
// this endpoint are ready for a real provider (Razorpay/Stripe/etc.) to post
// into `payment_webhooks` without any further backend changes.
exports.webhooks = async (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM payment_webhooks ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`SELECT * FROM payment_webhooks ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  res.json({
    items: rows.map((r) => ({
      id: r.id, gateway: r.gateway, eventType: r.event_type, transactionId: r.transaction_id, status: r.status,
      failureReason: r.failure_reason, syncStatus: r.sync_status, retryCount: r.retry_count, isSample: !!r.is_sample, receivedAt: db.iso(r.received_at),
    })),
    total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
  });
};

exports.resyncWebhook = async (req, res) => {
  const row = await db.one('SELECT * FROM payment_webhooks WHERE id = ?', [req.params.id]);
  if (!row) throw notFound('Webhook event not found.');
  await db.query("UPDATE payment_webhooks SET sync_status = 'SYNCED', retry_count = retry_count + 1, last_retry_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
  await auditLog.record({ req, action: 'WEBHOOK_RESYNCED', entityType: 'PAYMENT_WEBHOOK', entityId: String(row.id), summary: `Manually re-synced webhook for transaction ${row.transaction_id}` });
  res.json({ ok: true, message: 'Marked as re-synced. (No live gateway is connected — this simulates a manual resync.)' });
};
