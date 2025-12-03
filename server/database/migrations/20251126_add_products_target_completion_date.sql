-- Migration: Add target_completion_date and estimated_hours to products
-- Date: 2025-11-26

ALTER TABLE products
ADD COLUMN IF NOT EXISTS target_completion_date TIMESTAMP;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC;

-- Ensure status and progress columns exist (idempotent)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'upcoming';

ALTER TABLE products
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);

-- Optional: create indexes if missing
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_manager ON products(project_manager_id);
