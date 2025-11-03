-- Fund Raise steps table
CREATE TABLE IF NOT EXISTS fund_raise_steps (
  id SERIAL PRIMARY KEY,
  fund_raise_id INTEGER NOT NULL REFERENCES fund_raises(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  assigned_to INTEGER REFERENCES users(id),
  due_date DATE,
  completed_date DATE,
  order_index INTEGER NOT NULL DEFAULT 0,
  probability_percent INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_frs_fund_raise_id ON fund_raise_steps(fund_raise_id);
CREATE INDEX IF NOT EXISTS idx_frs_status ON fund_raise_steps(status);
CREATE INDEX IF NOT EXISTS idx_frs_order ON fund_raise_steps(fund_raise_id, order_index);

-- Chat/comments for fund raise steps
CREATE TABLE IF NOT EXISTS fund_raise_step_chats (
  id SERIAL PRIMARY KEY,
  step_id INTEGER NOT NULL REFERENCES fund_raise_steps(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  user_name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text','image','file','system')),
  is_rich_text BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_frs_chats_step_id ON fund_raise_step_chats(step_id);

-- Ensure updated_at column exists on chats (for existing installations)
ALTER TABLE IF EXISTS fund_raise_step_chats
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Ensure trigger function exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
    ) THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE 'plpgsql';
    END IF;
END $$;

-- Apply triggers to update updated_at on fund raise steps and chats
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'fund_raise_steps'
          AND trigger_name = 'update_fund_raise_steps_updated_at'
    ) THEN
        CREATE TRIGGER update_fund_raise_steps_updated_at
        BEFORE UPDATE ON fund_raise_steps
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'fund_raise_step_chats'
          AND trigger_name = 'update_fund_raise_step_chats_updated_at'
    ) THEN
        CREATE TRIGGER update_fund_raise_step_chats_updated_at
        BEFORE UPDATE ON fund_raise_step_chats
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
