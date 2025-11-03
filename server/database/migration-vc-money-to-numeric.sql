-- Convert money-related columns to NUMERIC(14,2) storing values as millions as entered (e.g., 0.50)
-- Heuristic during conversion: if previous BIGINT looked like minor units (very large), scale down
DO $$
BEGIN
  -- minimum_size
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='vcs' AND column_name='minimum_size'
  ) THEN
    ALTER TABLE vcs 
      ALTER COLUMN minimum_size TYPE NUMERIC(14,2)
      USING (
        CASE 
          WHEN minimum_size IS NULL THEN NULL
          WHEN minimum_size > 1000000 THEN round((minimum_size::numeric / 100000000), 2) -- from minor units of $Mn
          ELSE round(minimum_size::numeric, 2)
        END
      );
  END IF;

  -- maximum_size
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='vcs' AND column_name='maximum_size'
  ) THEN
    ALTER TABLE vcs 
      ALTER COLUMN maximum_size TYPE NUMERIC(14,2)
      USING (
        CASE 
          WHEN maximum_size IS NULL THEN NULL
          WHEN maximum_size > 1000000 THEN round((maximum_size::numeric / 100000000), 2)
          ELSE round(maximum_size::numeric, 2)
        END
      );
  END IF;

  -- minimum_arr_requirement
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='vcs' AND column_name='minimum_arr_requirement'
  ) THEN
    ALTER TABLE vcs 
      ALTER COLUMN minimum_arr_requirement TYPE NUMERIC(14,2)
      USING (
        CASE 
          WHEN minimum_arr_requirement IS NULL THEN NULL
          WHEN minimum_arr_requirement > 1000000 THEN round((minimum_arr_requirement::numeric / 100000000), 2)
          ELSE round(minimum_arr_requirement::numeric, 2)
        END
      );
  END IF;
END $$;
