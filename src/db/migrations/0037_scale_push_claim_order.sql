-- Measured at 100,000 due synthetic deliveries: the existing
-- (status, next_attempt_at) index required an external sort because the claim
-- spans multiple statuses. Pre-stage the equivalent index concurrently on a
-- large production table with CREATE INDEX CONCURRENTLY, then let this
-- additive migration record it.
CREATE INDEX IF NOT EXISTS "push_deliveries_claim_order_idx"
  ON "push_deliveries" ("next_attempt_at", "id");
