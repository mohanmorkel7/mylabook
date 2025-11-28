-- Add operator and negative match column to mail_configs
ALTER TABLE mail_configs
  ADD COLUMN IF NOT EXISTS field_operator VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS field_value_not TEXT DEFAULT NULL;

-- Create indexes on operator if needed
CREATE INDEX IF NOT EXISTS idx_mail_configs_field_operator ON mail_configs(field_operator);
