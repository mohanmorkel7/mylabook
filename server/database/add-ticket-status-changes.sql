-- Add ticket_status_changes table to store status change reasons and history
CREATE TABLE IF NOT EXISTS ticket_status_changes (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_status_id INTEGER,
  to_status_id INTEGER,
  reason TEXT,
  user_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_status_changes_ticket_id ON ticket_status_changes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_changes_created_at ON ticket_status_changes(created_at);
