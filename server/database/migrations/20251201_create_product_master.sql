-- Migration: create product_master table
-- Date: 2025-12-01

CREATE TABLE IF NOT EXISTS product_master (
  id SERIAL PRIMARY KEY,
  product_id TEXT UNIQUE NOT NULL, -- e.g., MYLA-PRD-001
  name TEXT NOT NULL,
  description TEXT,
  current_version TEXT,
  repository_url TEXT,
  product_url TEXT,
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending','inprogress','completed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION set_updated_at_product_master()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_master_updated_at ON product_master;
CREATE TRIGGER trg_product_master_updated_at
BEFORE UPDATE ON product_master
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_product_master();

-- Sequence for generating numeric suffix
CREATE SEQUENCE IF NOT EXISTS product_master_seq START 1;

-- Function to generate product_id like MYLA-PRD-001
CREATE OR REPLACE FUNCTION generate_product_master_id()
RETURNS TEXT AS $$
DECLARE
  n INT;
BEGIN
  n := nextval('product_master_seq');
  RETURN 'MYLA-PRD-' || lpad(n::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Optional index for status
CREATE INDEX IF NOT EXISTS idx_product_master_status ON product_master(status);
