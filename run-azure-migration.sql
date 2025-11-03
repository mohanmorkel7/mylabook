-- Run Azure migration to add missing columns
-- Execute this script to fix the "azure_object_id does not exist" error

BEGIN;

-- Add Azure AD related fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS azure_object_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS sso_external_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_azure_object_id ON users(azure_object_id);
CREATE INDEX IF NOT EXISTS idx_users_sso_provider ON users(sso_provider);

-- Update role constraint to include 'unknown' role
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
CHECK (role IN (
  'admin', 'sales', 'product', 'development', 'db', 
  'finops', 'finance', 'hr_management', 'infra', 'switch_team', 'unknown'
));

-- Add job_title column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);

-- Create view for unknown users needing role assignment
CREATE OR REPLACE VIEW users_need_role_assignment AS
SELECT 
  id,
  first_name,
  last_name,
  email,
  department,
  azure_object_id,
  sso_provider,
  job_title,
  created_at,
  updated_at
FROM users 
WHERE role = 'unknown' 
  AND sso_provider IS NOT NULL
ORDER BY created_at DESC;

-- Add helpful comments
COMMENT ON COLUMN users.azure_object_id IS 'Azure AD Object ID for SSO users';
COMMENT ON COLUMN users.sso_provider IS 'SSO provider name (microsoft, google, etc.)';
COMMENT ON COLUMN users.sso_external_id IS 'External ID from SSO provider';
COMMENT ON COLUMN users.profile_picture_url IS 'URL to user profile picture from SSO provider';
COMMENT ON COLUMN users.job_title IS 'User job title from Azure AD or manual entry';

COMMIT;

-- Verify the changes
SELECT 'Azure migration completed!' as status;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('azure_object_id', 'sso_provider', 'job_title')
ORDER BY column_name;
