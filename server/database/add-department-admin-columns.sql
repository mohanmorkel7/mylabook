-- Migration: add department admin fields to users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_for_department VARCHAR;

-- Ensure only one active admin per department (where admin flag is true and department specified)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_admin_for_department
  ON users (admin_for_department)
  WHERE department_admin = true AND admin_for_department IS NOT NULL;

-- Backfill: set NULL admin_for_department to NULL explicitly (no-op) and ensure defaults
UPDATE users SET department_admin = FALSE WHERE department_admin IS NULL;

-- Note: If you want to enforce at application level too, ensure code checks uniqueness before insert/update.
