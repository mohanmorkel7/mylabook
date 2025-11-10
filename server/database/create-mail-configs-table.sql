CREATE TABLE IF NOT EXISTS mail_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Legacy email matching criteria
  field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('subject', 'fromEmail', 'toEmail', 'body')),
  field_value TEXT NOT NULL,

  -- New email matching criteria
  from_email VARCHAR(255),
  to_email VARCHAR(255),
  subject_pattern TEXT,
  body_content TEXT,
  body_match_type VARCHAR(50) DEFAULT 'word' CHECK (body_match_type IN ('word', 'full')),

  -- Ticket creation details
  project_id INTEGER NOT NULL,
  priority_id INTEGER NOT NULL,
  assigned_to_id INTEGER NOT NULL,
  watcher_user_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  -- Optional routing and status fields
  team_id INTEGER REFERENCES ticket_teams(id),
  bucket_id INTEGER REFERENCES ticket_buckets(id),
  status_id INTEGER REFERENCES ticket_statuses(id),
  demand SMALLINT DEFAULT NULL,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Track processed emails to prevent duplicate ticket creation
CREATE TABLE IF NOT EXISTS mail_processing_log (
  id SERIAL PRIMARY KEY,
  mail_config_id INTEGER NOT NULL,
  email_id VARCHAR(255) NOT NULL,
  email_subject TEXT,
  email_from TEXT,
  ticket_id INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (mail_config_id) REFERENCES mail_configs(id) ON DELETE CASCADE,
  UNIQUE(mail_config_id, email_id)
);

-- Store created tickets via email automation
CREATE TABLE IF NOT EXISTS created_tickets (
  id SERIAL PRIMARY KEY,
  email_id VARCHAR(255) NOT NULL,
  mail_config_id INTEGER NOT NULL,
  ticket_id INTEGER NOT NULL,
  mitra_ticket_id INTEGER NOT NULL,
  mitra_response JSONB,
  email_subject TEXT,
  email_from VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (mail_config_id) REFERENCES mail_configs(id) ON DELETE CASCADE
);

-- Create indices for better query performance
CREATE INDEX IF NOT EXISTS idx_mail_configs_user_id ON mail_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_mail_configs_active ON mail_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_mail_processing_log_config ON mail_processing_log(mail_config_id);
CREATE INDEX IF NOT EXISTS idx_mail_processing_log_email ON mail_processing_log(email_id);
CREATE INDEX IF NOT EXISTS idx_created_tickets_config ON created_tickets(mail_config_id);
CREATE INDEX IF NOT EXISTS idx_created_tickets_email ON created_tickets(email_id);
CREATE INDEX IF NOT EXISTS idx_created_tickets_created ON created_tickets(created_at);
