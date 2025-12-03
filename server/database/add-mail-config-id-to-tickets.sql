-- Add mail_config_id column to tickets table to track tickets created from email automation
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS mail_config_id INTEGER REFERENCES mail_configs(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tickets_mail_config_id ON tickets(mail_config_id);

-- Add a computed column or view to identify tickets created from mail configs
-- For identification purposes when querying
