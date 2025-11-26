-- Migration: add project_manager_id column to products if missing
-- Adds project_manager_id column and index, safe to run if table exists without the column

DO $$
BEGIN
  -- Only add the column if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'project_manager_id'
  ) THEN
    ALTER TABLE products
      ADD COLUMN project_manager_id INTEGER;
    RAISE NOTICE 'Added products.project_manager_id column';
  ELSE
    RAISE NOTICE 'products.project_manager_id column already exists, skipping';
  END IF;
END$$;

-- Ensure index exists for queries filtering by project_manager_id
CREATE INDEX IF NOT EXISTS idx_products_manager ON products(project_manager_id);

-- Note: no default value is set. If you need a default, update rows explicitly.
-- Example to set default for existing rows (uncomment and adjust as necessary):
-- UPDATE products SET project_manager_id = <default_user_id> WHERE project_manager_id IS NULL;
