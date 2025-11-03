-- Alter follow_ups.due_date to store time as well (TIMESTAMPTZ)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'follow_ups'
      AND column_name = 'due_date'
      AND data_type = 'date'
  ) THEN
    -- Convert existing DATE values to TIMESTAMPTZ at 00:00 UTC to preserve the day
    ALTER TABLE follow_ups 
      ALTER COLUMN due_date TYPE TIMESTAMPTZ 
      USING (CASE WHEN due_date IS NULL THEN NULL ELSE (due_date::timestamp AT TIME ZONE 'UTC') END);
  END IF;
END $$;
