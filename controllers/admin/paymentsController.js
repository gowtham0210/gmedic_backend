const db = require('../../db');
const paymentModel = require('../../models/paymentModel');
const { notFound, badRequest } = require('../../utils/http');
const webhookProcessor = require('../../services/webhookProcessor');
const auditLog = require('../../services/auditLog');
const config = require('../../config');

exports.list = async (req, res) => {
  const { hospitalId, doctorId, from, to, status, purpose, q, page, pageSize } = req.query;
  res.json(await paymentModel.adminSearch({ hospitalId, doctorId, from, to, status, purpose, q, page, pageSize }));
};

// Payment gateway webhook inbox. Until PAYMENT_GATEWAY is set this only holds
// the sample rows seeded by `npm run db:setup`; a real provider
// (Razorpay/Stripe/etc.) posts into `payment_webhooks` with no further backend
// changes. `gateway` and `sampleCount` let the UI say which of the two it is.
exports.webhooks = async (req, res) => {
  const { status, sample, page = 1, pageSize = 20 } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  // sample=hide leaves out the development/setup events (is_sample); sample=only shows just those.
  if (sample === 'hide') clauses.push('is_sample = 0');
  if (sample === 'only') clauses.push('is_sample = 1');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM payment_webhooks ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`SELECT * FROM payment_webhooks ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  const sampleCount = Number((await db.one('SELECT COUNT(*) AS n FROM payment_webhooks WHERE is_sample = 1')).n);
  res.json({
    items: rows.map((r) => ({
      id: r.id, gateway: r.gateway, eventType: r.event_type, transactionId: r.transaction_id, status: r.status,
      failureReason: r.failure_reason, syncStatus: r.sync_status, retryCount: r.retry_count, isSample: !!r.is_sample, receivedAt: db.iso(r.received_at),
    })),
    total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
    gateway: { connected: !!config.paymentGateway, name: config.paymentGateway || null },
    sampleCount,
  });
};

// POST /api/admin/webhooks/:id/resync
// Runs the stored event again against the platform's records (services/webhookProcessor.js) and only then
// marks it synced. If it still can't be applied the event stays failed, with the reason.
exports.resyncWebhook = async (req, res) => {
  const row = await db.one('SELECT * FROM payment_webhooks WHERE id = ?', [req.params.id]);
  if (!row) throw notFound('Webhook event not found.');
  if (row.status !== 'FAILED' && !['PENDING', 'FAILED'].includes(row.sync_status)) return res.json({ ok: true, message: 'Already synced — nothing to retry.' });
  const result = await webhookProcessor.process(row, { req });
  await auditLog.record({
    req, action: result.ok ? 'WEBHOOK_RESYNCED' : 'WEBHOOK_RESYNC_FAILED', entityType: 'PAYMENT_WEBHOOK', entityId: String(row.id),
    summary: `Retried ${row.event_type} for transaction ${row.transaction_id}: ${result.message}`,
  });
  if (!result.ok) throw badRequest(`The event could not be applied: ${result.message}`);
  res.json({ ok: true, message: result.message });
};

// GET /api/admin/payments/:id — one payment with its appointment, refunds, disputes and gateway events.
exports.get = async (req, res) => {
  const payment = await paymentModel.adminFindById(req.params.id);
  if (!payment) throw notFound('Payment not found.');
  const [refunds, disputes, events] = await Promise.all([
    db.query('SELECT id, amount, status, reason, created_at FROM refunds WHERE payment_id = ? ORDER BY created_at', [payment.id]),
    db.query('SELECT id, amount, status, reason, created_at FROM disputes WHERE payment_id = ? ORDER BY created_at', [payment.id]),
    db.query('SELECT id, event_type, status, sync_status, failure_reason, received_at FROM payment_webhooks WHERE payment_id = ? OR transaction_id = ? ORDER BY received_at DESC LIMIT 20', [payment.id, payment.transactionId]),
  ]);
  const refunded = refunds.filter((r) => r.status !== 'REJECTED').reduce((sum, r) => sum + Number(r.amount), 0);
  res.json({
    payment: {
      // A booking token is never refunded; a fee collected at the hospital is the hospital's to return.
      ...payment, refunded, refundable: payment.purpose === 'TOKEN' || payment.gateway === 'FRONT_DESK' ? 0 : Math.max(0, payment.amount - refunded),
      refunds: refunds.map((r) => ({ id: r.id, amount: Number(r.amount), status: r.status, reason: r.reason, createdAt: db.iso(r.created_at) })),
      disputes: disputes.map((d) => ({ id: d.id, amount: Number(d.amount), status: d.status, reason: d.reason, createdAt: db.iso(d.created_at) })),
      events: events.map((e) => ({ id: e.id, eventType: e.event_type, status: e.status, syncStatus: e.sync_status, failureReason: e.failure_reason, receivedAt: db.iso(e.received_at) })),
    },
  });
};
