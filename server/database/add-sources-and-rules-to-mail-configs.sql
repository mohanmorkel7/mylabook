-- Add columns to support sources and rules configuration
ALTER TABLE mail_configs
ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS team VARCHAR(50) DEFAULT NULL;

-- Create index for better query performance on sources
CREATE INDEX IF NOT EXISTS idx_mail_configs_sources ON mail_configs USING GIN(sources);

-- Add comment to document the structure
COMMENT ON COLUMN mail_configs.sources IS 'JSON array storing source configurations with email rules';
COMMENT ON COLUMN mail_configs.team IS 'Team assignment (FinOps, Product, Sales)';
