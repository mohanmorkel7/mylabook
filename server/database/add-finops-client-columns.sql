-- Migration to add client_id and client_name columns to finops_tasks table
-- This allows linking tasks to specific clients

-- Add client_id column
ALTER TABLE finops_tasks
ADD COLUMN IF NOT EXISTS client_id INTEGER;

-- Add foreign key constraint only if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_finops_tasks_client_id'
      AND table_name = 'finops_tasks'
  ) THEN
    ALTER TABLE finops_tasks
      ADD CONSTRAINT fk_finops_tasks_client_id
      FOREIGN KEY (client_id) REFERENCES finops_clients(id) ON DELETE SET NULL;
  END IF;
END $$ LANGUAGE plpgsql;

-- Add client_name column for redundant storage (for performance)
ALTER TABLE finops_tasks
ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_finops_tasks_client_id ON finops_tasks(client_id);

-- Update existing tasks with sample client data
UPDATE finops_tasks
SET client_id = 1, client_name = 'Acme Corporation'
WHERE client_id IS NULL AND task_name LIKE '%CLEARING%';

UPDATE finops_tasks
SET client_id = 2, client_name = 'TechCorp Solutions'
WHERE client_id IS NULL AND task_name LIKE '%RECONCILIATION%';

UPDATE finops_tasks
SET client_id = 3, client_name = 'Global Finance Ltd'
WHERE client_id IS NULL;
