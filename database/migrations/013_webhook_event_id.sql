-- Webhook idempotency: store the gateway's own event id (e.g. Razorpay
-- `x-razorpay-event-id`, Stripe `evt_…`) and allow each one only once per
-- gateway. A redelivered or retried event then hits this index instead of
-- being processed twice. Existing/sample rows have no event id, so the index
-- is partial. Duplicate payment rows are separately blocked by
-- uq_payments_txn and uq_payments_one_paid.

ALTER TABLE payment_webhooks ADD COLUMN event_id TEXT;
CREATE UNIQUE INDEX uq_webhooks_event ON payment_webhooks (gateway, event_id) WHERE event_id IS NOT NULL;
