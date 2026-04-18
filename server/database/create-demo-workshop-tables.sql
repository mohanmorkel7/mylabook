-- ============================================================================
-- DEMO/WORKSHOP MODULE - Database Schema
-- ============================================================================
-- This schema manages the Demo/Workshop workflow for lead management
-- Includes video storage, demo sessions, results, and participant tracking

-- Demos table: Main demo/workshop sessions
CREATE TABLE IF NOT EXISTS demos (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Scheduled', 'In Progress', 'Completed', 'Cancelled')),
  demo_date TIMESTAMP,
  duration_minutes INTEGER,
  location TEXT,
  attendees TEXT, -- JSON array of attendee names
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Demo videos: Video files uploaded for demos
CREATE TABLE IF NOT EXISTS demo_videos (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER REFERENCES demos(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  mime_type TEXT,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Demo results: Outcomes and feedback from demos
CREATE TABLE IF NOT EXISTS demo_results (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  result_status TEXT NOT NULL CHECK (result_status IN ('Positive', 'Neutral', 'Needs Follow-up', 'Lost')) DEFAULT 'Neutral',
  client_feedback TEXT,
  next_steps TEXT,
  proceed_to_next BOOLEAN DEFAULT false,
  next_module TEXT, -- e.g., 'Demo/Workshop', 'Proposal', 'Negotiation'
  completion_date TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Demo participants: Track who attended/participated
CREATE TABLE IF NOT EXISTS demo_participants (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  role TEXT,
  attendance_status TEXT CHECK (attendance_status IN ('Invited', 'Confirmed', 'Attended', 'No-show')) DEFAULT 'Invited',
  feedback TEXT,
  joined_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Demo chat messages: Team collaboration on demos
CREATE TABLE IF NOT EXISTS demo_chat_messages (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'system', 'note')) DEFAULT 'text',
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_demos_lead_id ON demos(lead_id);
CREATE INDEX IF NOT EXISTS idx_demos_status ON demos(status);
CREATE INDEX IF NOT EXISTS idx_demos_demo_date ON demos(demo_date);
CREATE INDEX IF NOT EXISTS idx_demo_videos_demo_id ON demo_videos(demo_id);
CREATE INDEX IF NOT EXISTS idx_demo_results_demo_id ON demo_results(demo_id);
CREATE INDEX IF NOT EXISTS idx_demo_participants_demo_id ON demo_participants(demo_id);
CREATE INDEX IF NOT EXISTS idx_demo_chat_demo_id ON demo_chat_messages(demo_id);

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_demos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_demos_timestamp ON demos;
CREATE TRIGGER update_demos_timestamp
BEFORE UPDATE ON demos
FOR EACH ROW
EXECUTE FUNCTION update_demos_updated_at();

-- Activity logging for demo changes
CREATE TABLE IF NOT EXISTS demo_activity_log (
  id SERIAL PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'video_added', 'result_recorded', 'status_changed'
  details TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_activity_demo_id ON demo_activity_log(demo_id);
CREATE INDEX IF NOT EXISTS idx_demo_activity_action ON demo_activity_log(action);
