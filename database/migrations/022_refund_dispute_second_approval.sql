-- Disputes that are decided in the patient's favour create one refund (refunds.dispute_id), which then
-- comes off the hospital's next settlement. A large refund needs two different admin approvals, so the
-- first one is recorded here while the refund stays PENDING.
ALTER TABLE refunds ADD COLUMN dispute_id TEXT REFERENCES disputes (id);
ALTER TABLE refunds ADD COLUMN first_approved_by TEXT REFERENCES users (id);
ALTER TABLE refunds ADD COLUMN first_approved_at TEXT;
CREATE UNIQUE INDEX uq_refund_dispute ON refunds (dispute_id) WHERE dispute_id IS NOT NULL AND status <> 'REJECTED';

ALTER TABLE disputes ADD COLUMN decided_by TEXT REFERENCES users (id);
ALTER TABLE disputes ADD COLUMN decided_at TEXT;
