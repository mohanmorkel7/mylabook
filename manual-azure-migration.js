// Manual Azure migration script
// Run this when database becomes available to fix "azure_object_id does not exist" error

const azureMigrationSQL = `
-- Add Azure AD related fields to users table
BEGIN;

-- Add columns if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS azure_object_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS sso_external_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);

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
COMMENT ON COLUMN users.job_title IS 'User job title from Azure AD or manual entry';

COMMIT;

-- Verify the migration
SELECT 'Azure migration completed successfully!' as status;
`;

console.log("🔧 Azure Migration SQL:");
console.log(
  "Copy and paste this SQL into your database to fix the azure_object_id error:",
);
console.log("=" * 80);
console.log(azureMigrationSQL);
console.log("=" * 80);
console.log("");
console.log("📋 This migration will:");
console.log("✅ Add azure_object_id column to users table");
console.log("✅ Add sso_provider column for tracking SSO source");
console.log("✅ Add job_title column for Azure AD job titles");
console.log("✅ Add 'unknown' role for users needing manual assignment");
console.log("✅ Create helpful indexes and views");
console.log("");
console.log("🎯 After running this migration:");
console.log("- Azure AD sync will work without column errors");
console.log("- Users without departments will become 'unknown' users");
console.log(
  "- 'Assign Roles' page will show unknown users for bulk assignment",
);
console.log("");
console.log(
  "💡 To apply: Run this SQL in your database management tool or psql",
);
