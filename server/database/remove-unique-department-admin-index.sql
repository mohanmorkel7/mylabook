-- Migration: drop unique index that enforced only one department admin
-- This allows multiple users to be department_admin for the same admin_for_department value

DROP INDEX IF EXISTS uq_users_admin_for_department;
