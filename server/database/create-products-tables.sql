-- Migration: create products and related tables for Product Management

CREATE TABLE IF NOT EXISTS product_teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  steps JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  assigned_team_id INTEGER REFERENCES product_teams(id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES product_templates(id) ON DELETE SET NULL,
  project_manager_id INTEGER,
  target_completion_date TIMESTAMP,
  estimated_hours NUMERIC,
  status VARCHAR(32) DEFAULT 'upcoming', -- upcoming, open, in_progress, completed, delayed, archived
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_steps (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  step_order INTEGER DEFAULT 0,
  probability INTEGER DEFAULT 0,
  eta TIMESTAMP, -- ETA for the step
  status VARCHAR(32) DEFAULT 'pending', -- pending, in_progress, completed, blocked
  estimated_hours NUMERIC,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_comments (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  step_id INTEGER REFERENCES product_steps(id) ON DELETE CASCADE,
  user_id INTEGER,
  content TEXT,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_attachments (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  step_id INTEGER REFERENCES product_steps(id) ON DELETE CASCADE,
  user_id INTEGER,
  filename TEXT,
  file_path TEXT,
  mime_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_manager ON products(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_product_steps_product ON product_steps(product_id);
CREATE INDEX IF NOT EXISTS idx_product_steps_order ON product_steps(product_id, step_order);
CREATE INDEX IF NOT EXISTS idx_product_templates_category ON product_templates(category);

-- Trigger to update updated_at on row modification
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_column();

CREATE TRIGGER trg_product_steps_updated_at
BEFORE UPDATE ON product_steps
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_column();

CREATE TRIGGER trg_product_templates_updated_at
BEFORE UPDATE ON product_templates
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_column();
