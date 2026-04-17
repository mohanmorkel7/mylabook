-- ============================================================================
-- Add team chat messages table for follow-ups
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_leads_team_chat_messages (
  id SERIAL PRIMARY KEY,
  follow_up_id INTEGER NOT NULL REFERENCES sales_leads_follow_ups(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'audio')),
  
  -- Message content
  content TEXT NOT NULL,  -- Text content or audio URL
  author TEXT NOT NULL,   -- Username
  
  -- Audio-specific fields
  audio_filename TEXT,
  audio_url TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_leads_team_chat_follow_up_id ON sales_leads_team_chat_messages(follow_up_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_team_chat_created_at ON sales_leads_team_chat_messages(created_at DESC);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_team_chat_messages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_leads_team_chat_updated_at_trigger
BEFORE UPDATE ON sales_leads_team_chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_team_chat_messages_timestamp();
