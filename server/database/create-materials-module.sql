-- Create independent Materials table
CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('video', 'pdf', 'ppt', 'word')) DEFAULT 'video',
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  duration_seconds INTEGER, -- For videos
  page_count INTEGER, -- For PDFs
  is_published BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(file_type);
CREATE INDEX IF NOT EXISTS idx_materials_created_by ON materials(created_by);
CREATE INDEX IF NOT EXISTS idx_materials_published ON materials(is_published);

-- Create junction table for many-to-many relationship between demos and materials
CREATE TABLE IF NOT EXISTS demo_materials (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(demo_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_materials_demo_id ON demo_materials(demo_id);
CREATE INDEX IF NOT EXISTS idx_demo_materials_material_id ON demo_materials(material_id);

-- Create activity log for materials
CREATE TABLE IF NOT EXISTS material_activity_log (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'published', 'unpublished')) DEFAULT 'created',
  details TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_activity_material_id ON material_activity_log(material_id);
CREATE INDEX IF NOT EXISTS idx_material_activity_action ON material_activity_log(action);

-- Create trigger for materials updated_at
CREATE OR REPLACE FUNCTION update_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_materials_timestamp ON materials;
CREATE TRIGGER update_materials_timestamp
BEFORE UPDATE ON materials
FOR EACH ROW
EXECUTE FUNCTION update_materials_updated_at();
