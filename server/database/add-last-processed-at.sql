-- Add last_processed_at column to mail_configs to track when emails were last processed
-- This prevents duplicate email processing on scheduler runs

ALTER TABLE mail_configs
ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMP DEFAULT NULL;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_mail_configs_last_processed ON mail_configs(last_processed_at);
