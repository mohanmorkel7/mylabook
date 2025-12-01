-- Migration: add indexes to improve tickets listing performance
-- Note: Run this migration against your Postgres DB to create the indexes

CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status_id ON tickets (status_id);
CREATE INDEX IF NOT EXISTS idx_tickets_mail_config_id ON tickets (mail_config_id);

-- If watcher_user_ids is used for filters, consider a GIN index
CREATE INDEX IF NOT EXISTS idx_tickets_watcher_user_ids_gin ON tickets USING GIN (watcher_user_ids);
