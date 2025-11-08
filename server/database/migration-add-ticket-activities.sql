-- Migration: create ticket_activities and ticket_notifications if missing

CREATE TABLE IF NOT EXISTS ticket_activities (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_activities_ticket_id ON ticket_activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_user_id ON ticket_activities(user_id);

CREATE TABLE IF NOT EXISTS ticket_notifications (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_notifications_user_id ON ticket_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_notifications_is_read ON ticket_notifications(is_read);

-- Ensure ticket_watchers exists (safe no-op if already present)
CREATE TABLE IF NOT EXISTS ticket_watchers (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ticket_id, user_id)
);

COMMIT;
