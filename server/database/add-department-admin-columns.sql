-- Migration: add department admin fields to users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_for_department VARCHAR;

-- Previously enforced unique department admin via a partial unique index. This project now allows multiple department admins per department.
-- (Index removed via separate migration: remove-unique-department-admin-index.sql)

-- Backfill: set NULL admin_for_department to NULL explicitly (no-op) and ensure defaults
UPDATE users SET department_admin = FALSE WHERE department_admin IS NULL;

-- Note: If you want to enforce at application level too, ensure code checks uniqueness before insert/update.
