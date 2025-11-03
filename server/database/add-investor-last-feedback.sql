-- Add investor_last_feedback column to vcs table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vcs' AND column_name = 'investor_last_feedback'
    ) THEN
        ALTER TABLE vcs 
        ADD COLUMN investor_last_feedback TEXT;
    END IF;
END $$;
