-- Migration: Add template_id to products
-- Date: 2025-11-26

ALTER TABLE products
ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES product_templates(id) ON DELETE SET NULL;

-- Optionally create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_template_id ON products(template_id);
