-- Migration: add watcher_user_ids column to tickets and create ticket_display_seq for MYLA track IDs

-- Add watcher_user_ids column as integer array
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS watcher_user_ids INTEGER[] DEFAULT '{}';

-- Create sequence for display ticket IDs starting at 1001 if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'ticket_display_seq') THEN
    CREATE SEQUENCE ticket_display_seq START 1001;
  END IF;
END$$;

-- Grant usage to public (safe in dev environments)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'ticket_display_seq') THEN
    EXECUTE 'GRANT USAGE ON SEQUENCE ticket_display_seq TO public';
  END IF;
END$$;
