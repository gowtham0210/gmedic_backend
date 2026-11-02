// Applies one stored payment-gateway event (a row of `payment_webhooks`) to the platform's own records.
// It is idempotent: an event whose effect is already in place changes nothing and counts as processed, so it
// is safe to run again. "Retry sync" in the admin webhook inbox calls this; so will the inbound webhook
// endpoint once a live gateway is connected (it stores the event, then processes it).
//
// Supported events (Razorpay-style names): payment.captured, payment.failed, refund.processed,
// charge.dispute.created / payment.dispute.created. Anything else fails with a clear reason.

const db = require('../db');
const disputes = require('./disputes');

function payloadOf(row) {
  try { return row.payload ? JSON.parse(row.payload) : {}; } catch { return {}; }
}

async function paymentFor(row, payload) {
  if (row.payment_id) { const p = await db.one('SELECT * FROM payments WHERE id = ?', [row.payment_id]); if (p) return p; }
  const txn = row.transaction_id || payload.transactionId || payload.transaction_id;
  return txn ? db.one('SELECT * FROM payments WHERE transaction_id = ?', [txn]) : null;
}

const HANDLERS = {
  async 'payment.captured'(row, payload, payment) {
    if (!payment) return { ok: false, message: 'No payment matches this transaction.' };
    if (payment.status === 'PAID') return { ok: true, message: `Payment ${payment.id} is already paid. Nothing to change.` };
    try {
      await db.query("UPDATE payments SET status = 'PAID', gateway_status = 'captured', failure_reason = NULL, paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP) WHERE id = ? AND status <> 'PAID'", [payment.id]);
    } catch (err) {
      return { ok: false, message: `Could not mark ${payment.id} paid: ${err.message}` };
    }
    return { ok: true, message: `Payment ${payment.id} is now marked paid.` };
  },

  async 'payment.failed'(row, payload, payment) {
    if (!payment) return { ok: false, message: 'No payment matches this transaction.' };
    if (payment.status === 'FAILED') return { ok: true, message: `Payment ${payment.id} is already marked failed.` };
    if (payment.status === 'PAID') return { ok: false, message: `Payment ${payment.id} is already paid, so a failure event can't be applied. Check the gateway.` };
    await db.query("UPDATE payments SET status = 'FAILED', gateway_status = 'failed', failure_reason = ? WHERE id = ? AND status = 'PENDING'", [String(payload.reason || row.failure_reason || 'Payment failed at the gateway').slice(0, 255), payment.id]);
    return { ok: true, message: `Payment ${payment.id} is now marked failed.` };
  },

  async 'refund.processed'(row, payload) {
    const id = payload.refundId || payload.refund_id;
    if (!id) return { ok: false, message: 'The event has no refund ID, so it can\'t be matched to a refund.' };
    const refund = await db.one('SELECT * FROM refunds WHERE id = ?', [id]);
    if (!refund) return { ok: false, message: `No refund ${id} exists.` };
    if (refund.status === 'COMPLETED') return { ok: true, message: `Refund ${id} is already completed.` };
    if (refund.status === 'REJECTED' || refund.status === 'PENDING') return { ok: false, message: `Refund ${id} is ${refund.status.toLowerCase()}: it was not approved, so it can't be completed by the gateway.` };
    await db.query("UPDATE refunds SET status = 'COMPLETED', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ? AND status IN ('APPROVED', 'PROCESSING')", [id]);
    return { ok: true, message: `Refund ${id} is now completed.` };
  },

  // A chargeback raised by the bank: opens a dispute for an admin to decide.
  async 'charge.dispute.created'(row, payload, payment, ctx) {
    if (!payment) return { ok: false, message: 'No payment matches this transaction.' };
    const live = await db.one("SELECT id FROM disputes WHERE payment_id = ? AND status IN ('OPEN', 'UNDER_REVIEW')", [payment.id]);
    if (live) return { ok: true, message: `Dispute ${live.id} is already open for ${payment.id}.` };
    if (payment.status !== 'PAID') return { ok: false, message: `Payment ${payment.id} is ${payment.status.toLowerCase()}, so it can't be disputed.` };
    const full = await disputes.findPaidPayment(payment.id);
    const id = await disputes.open({ req: ctx.req, payment: full, amount: payload.amount, reason: payload.reason || 'Chargeback raised through the payment gateway', source: 'GATEWAY' });
    return { ok: true, message: `Dispute ${id} opened for ${payment.id}.` };
  },
};
HANDLERS['payment.dispute.created'] = HANDLERS['charge.dispute.created'];

// Runs the event again. Returns { ok, message }; the webhook row is updated either way.
async function process(row, ctx = {}) {
  const payload = payloadOf(row);
  const handler = HANDLERS[row.event_type];
  let result;
  if (!handler) result = { ok: false, message: `Unsupported event type "${row.event_type}".` };
  else {
    try { result = await handler(row, payload, await paymentFor(row, payload), ctx); } catch (err) { result = { ok: false, message: err.message || 'The event could not be applied.' }; }
  }
  await db.query(
    `UPDATE payment_webhooks SET status = ?, sync_status = ?, failure_reason = ?, retry_count = retry_count + 1, last_retry_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [result.ok ? 'PROCESSED' : 'FAILED', result.ok ? 'SYNCED' : 'FAILED', result.ok ? null : String(result.message).slice(0, 255), row.id]
  );
  return result;
}

module.exports = { process, HANDLERS };
