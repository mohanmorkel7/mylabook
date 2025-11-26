-- Migration: add product_id column to workflow_projects to link to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_projects' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE workflow_projects
      ADD COLUMN product_id INTEGER;
    -- Add foreign key constraint if products table exists
    BEGIN
      ALTER TABLE workflow_projects
        ADD CONSTRAINT fk_workflow_product_id FOREIGN KEY (product_id) REFERENCES products(id);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'products table not found; skipping FK creation';
    END;
    CREATE INDEX IF NOT EXISTS idx_workflow_product_id ON workflow_projects(product_id);
    RAISE NOTICE 'Added workflow_projects.product_id column';
  ELSE
    RAISE NOTICE 'workflow_projects.product_id already exists, skipping';
  END IF;
END$$;
