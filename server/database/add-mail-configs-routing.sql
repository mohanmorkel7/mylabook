-- Add routing and demand columns to mail_configs if missing
ALTER TABLE mail_configs
  ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES ticket_teams(id),
  ADD COLUMN IF NOT EXISTS bucket_id INTEGER REFERENCES ticket_buckets(id),
  ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES ticket_statuses(id),
  ADD COLUMN IF NOT EXISTS demand SMALLINT DEFAULT NULL;

-- Ensure indexes
CREATE INDEX IF NOT EXISTS idx_mail_configs_team_id ON mail_configs(team_id);
CREATE INDEX IF NOT EXISTS idx_mail_configs_bucket_id ON mail_configs(bucket_id);
CREATE INDEX IF NOT EXISTS idx_mail_configs_status_id ON mail_configs(status_id);
CREATE INDEX IF NOT EXISTS idx_mail_configs_demand ON mail_configs(demand);
