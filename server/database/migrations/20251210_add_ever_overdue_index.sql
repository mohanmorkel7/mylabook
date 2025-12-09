-- Migration: create indexes to optimize queries that filter by ever_overdue and overdue_at
-- Created: 2025-12-10

BEGIN;

-- Partial index to accelerate lookups of tickets that were ever overdue and queries that join/filter by status_id
CREATE INDEX IF NOT EXISTS idx_tickets_ever_overdue_true_status_id
ON tickets (status_id)
WHERE ever_overdue = TRUE;

-- Index on overdue_at to speed up any range queries or ordering on the timestamp
CREATE INDEX IF NOT EXISTS idx_tickets_overdue_at
ON tickets (overdue_at);

-- Update planner statistics
ANALYZE tickets;

COMMIT;
