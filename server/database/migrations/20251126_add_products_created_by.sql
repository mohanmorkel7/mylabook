-- Migration: Add created_by and timestamps to products
-- Date: 2025-11-26

ALTER TABLE products
ADD COLUMN IF NOT EXISTS created_by INTEGER;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Optionally create an index on created_by for lookup performance
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
