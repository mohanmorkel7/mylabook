-- Migration: Recreate workflow_project_summary view to use first_name/last_name
-- This ensures compatible column names if users table doesn't have a 'name' column

DO $$
BEGIN
  -- Drop existing view if it exists
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'workflow_project_summary') THEN
    EXECUTE 'DROP VIEW IF EXISTS workflow_project_summary CASCADE';
  END IF;

  -- Create the view using first_name/last_name fallback to email
  EXECUTE $$
    CREATE VIEW workflow_project_summary AS
    SELECT 
      wp.*,
      COALESCE(NULLIF(TRIM((u1.first_name || ' ' || u1.last_name)), ''), u1.email) as project_manager_name,
      COALESCE(NULLIF(TRIM((u2.first_name || ' ' || u2.last_name)), ''), u2.email) as creator_name,
      COUNT(DISTINCT ws.id) as total_steps,
      COUNT(DISTINCT CASE WHEN ws.status = 'completed' THEN ws.id END) as completed_steps,
      COUNT(DISTINCT CASE WHEN ws.status = 'in_progress' THEN ws.id END) as active_steps,
      COUNT(DISTINCT CASE WHEN ws.status = 'pending' THEN ws.id END) as pending_steps,
      COUNT(DISTINCT wc.id) as total_comments,
      COUNT(DISTINCT wd.id) as total_documents
    FROM workflow_projects wp
    LEFT JOIN users u1 ON wp.project_manager_id = u1.id
    LEFT JOIN users u2 ON wp.created_by = u2.id
    LEFT JOIN workflow_steps ws ON wp.id = ws.project_id
    LEFT JOIN workflow_comments wc ON wp.id = wc.project_id
    LEFT JOIN workflow_documents wd ON wp.id = wd.project_id
    GROUP BY wp.id, u1.first_name, u1.last_name, u1.email, u2.first_name, u2.last_name, u2.email;
  $$;
END$$;
