-- Add demo_files table to support multiple file types (videos, PDFs, presentations, documents)
CREATE TABLE IF NOT EXISTS demo_files (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK (file_type IN ('video', 'pdf', 'ppt', 'word')) DEFAULT 'video',
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  duration_seconds INTEGER, -- For videos
  page_count INTEGER, -- For PDFs
  uploaded_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  is_published BOOLEAN DEFAULT true, -- Can be hidden from public
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_demo_files_demo_id ON demo_files(demo_id);
CREATE INDEX IF NOT EXISTS idx_demo_files_type ON demo_files(file_type);
CREATE INDEX IF NOT EXISTS idx_demo_files_published ON demo_files(is_published);

-- Add shareable_link column to demos table for client access
ALTER TABLE demos ADD COLUMN IF NOT EXISTS shareable_link TEXT UNIQUE;
ALTER TABLE demos ADD COLUMN IF NOT EXISTS shareable_link_enabled BOOLEAN DEFAULT true;
ALTER TABLE demos ADD COLUMN IF NOT EXISTS link_expires_at TIMESTAMP;

-- Create a demo_public_links table for tracking shared links
CREATE TABLE IF NOT EXISTS demo_public_links (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  shareable_token VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  accessed_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP,
  UNIQUE(demo_id, shareable_token)
);

CREATE INDEX IF NOT EXISTS idx_demo_links_token ON demo_public_links(shareable_token);
CREATE INDEX IF NOT EXISTS idx_demo_links_demo_id ON demo_public_links(demo_id);

-- Create trigger for updated_at on demo_files
CREATE OR REPLACE FUNCTION update_demo_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_demo_files_timestamp ON demo_files;
CREATE TRIGGER update_demo_files_timestamp
BEFORE UPDATE ON demo_files
FOR EACH ROW
EXECUTE FUNCTION update_demo_files_updated_at();

-- Add demo_file_activity_log for tracking downloads/views
CREATE TABLE IF NOT EXISTS demo_file_activity (
  id SERIAL PRIMARY KEY,
  demo_file_id INTEGER NOT NULL REFERENCES demo_files(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('view', 'download', 'share')) DEFAULT 'view',
  ip_address TEXT,
  user_agent TEXT,
  accessed_by TEXT, -- For public views
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_file_activity_file_id ON demo_file_activity(demo_file_id);
CREATE INDEX IF NOT EXISTS idx_demo_file_activity_action ON demo_file_activity(action);
