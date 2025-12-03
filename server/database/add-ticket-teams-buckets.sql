-- Add ticket teams and buckets master tables, and extend tickets table

CREATE TABLE IF NOT EXISTS ticket_teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_buckets (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES ticket_teams(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, name)
);

-- Add new columns to tickets table if they do not exist
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES ticket_teams(id),
  ADD COLUMN IF NOT EXISTS bucket_id INTEGER REFERENCES ticket_buckets(id),
  ADD COLUMN IF NOT EXISTS demand INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sla_time TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS reason TEXT NULL;

-- Insert default teams
INSERT INTO ticket_teams (name, description) VALUES
  ('Product', 'Product team'),
  ('Infra', 'Infrastructure team'),
  ('Development', 'Development team'),
  ('Design', 'Design team'),
  ('Finance', 'Finance team'),
  ('HR', 'Human Resources'),
  ('Finops', 'FinOps team'),
  ('Database', 'Database team'),
  ('Switch', 'Switch team')
ON CONFLICT (name) DO NOTHING;

-- Ensure updated_at triggers for new tables
CREATE TRIGGER IF NOT EXISTS update_ticket_teams_updated_at BEFORE UPDATE ON ticket_teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_ticket_buckets_updated_at BEFORE UPDATE ON ticket_buckets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
