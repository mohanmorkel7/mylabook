-- Add 'designation' column to connections table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'connections'
      AND column_name = 'designation'
  ) THEN
    ALTER TABLE public.connections
      ADD COLUMN designation VARCHAR(255) NULL;
  END IF;
END $$;
