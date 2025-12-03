-- Migration: backfill products for existing workflow_projects that lack product_id
DO $$
DECLARE
  rec RECORD;
  new_prod_id INTEGER;
BEGIN
  FOR rec IN SELECT id, name, description, template_id, project_manager_id, target_completion_date, estimated_hours, created_by FROM workflow_projects WHERE product_id IS NULL LOOP
    -- Insert product
    INSERT INTO products (name, description, current_version, is_active, created_at, updated_at)
    VALUES (rec.name, rec.description, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id INTO new_prod_id;

    -- Update workflow project with product_id
    UPDATE workflow_projects SET product_id = new_prod_id WHERE id = rec.id;
  END LOOP;
  RAISE NOTICE 'Backfilled products for workflow_projects';
END$$;
