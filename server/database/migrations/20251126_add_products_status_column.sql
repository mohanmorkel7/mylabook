-- Migration: add status column to products if missing
-- Adds status column and index, safe to run if table exists without the column

DO $$
BEGIN
  -- Only add the column if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'status'
  ) THEN
    ALTER TABLE products
      ADD COLUMN status VARCHAR(32) DEFAULT 'upcoming';
    RAISE NOTICE 'Added products.status column';
  ELSE
    RAISE NOTICE 'products.status column already exists, skipping';
  END IF;
END$$;

-- Ensure index exists for queries filtering by status
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- Update existing rows with a sensible default if needed (optional)
-- Uncomment the following if you want to set a default for NULL statuses
-- UPDATE products SET status = 'upcoming' WHERE status IS NULL;
