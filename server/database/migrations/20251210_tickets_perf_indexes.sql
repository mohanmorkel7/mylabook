-- Migration: add indexes to improve tickets query performance
-- Created: 2025-12-10

BEGIN;

-- Index to accelerate ORDER BY created_at DESC and filters on created_at
CREATE INDEX IF NOT EXISTS idx_tickets_created_at_desc ON tickets (created_at DESC);

-- Indexes to speed up common WHERE filters
CREATE INDEX IF NOT EXISTS idx_tickets_status_id ON tickets (status_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_priority_id ON tickets (priority_id);
CREATE INDEX IF NOT EXISTS idx_tickets_mail_config_id ON tickets (mail_config_id);

-- If watcher_user_ids is commonly queried with ANY(), a GIN index helps
CREATE INDEX IF NOT EXISTS idx_tickets_watcher_user_ids_gin ON tickets USING GIN (watcher_user_ids);

ANALYZE tickets;

COMMIT;
