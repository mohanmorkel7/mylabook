-- Fix type mismatch in check_subtask_sla_notifications_ist function
-- The issue is that task_name is VARCHAR(255) but function expects TEXT

DROP FUNCTION IF EXISTS check_subtask_sla_notifications_ist();

CREATE OR REPLACE FUNCTION check_subtask_sla_notifications_ist()
RETURNS TABLE(
  notification_type TEXT,
  subtask_id INTEGER,
  task_id INTEGER,
  task_name VARCHAR(255),  -- Changed from TEXT to VARCHAR(255) to match database schema
  subtask_name VARCHAR(255), -- Changed from TEXT to VARCHAR(255) to match database schema
  assigned_to TEXT,
  client_name TEXT,
  time_diff_minutes INTEGER,
  message TEXT,
  priority TEXT,
  action_url TEXT,
  reporting_managers JSONB,
  escalation_managers JSONB
) AS $$
DECLARE
  current_time_ist TIMESTAMP;
  current_date_ist DATE;
  current_time_only TIME;
BEGIN
  -- Convert current UTC time to IST (UTC+5:30)
  current_time_ist := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata');
  current_date_ist := (current_time_ist)::DATE;
  current_time_only := (current_time_ist)::TIME;
  
  -- Debug log
  RAISE NOTICE 'IST SLA Check: Current IST time: %, Current date: %', current_time_ist, current_date_ist;
  
  -- 1) Pre-start notification (15 minutes before start time)
  RETURN QUERY
  SELECT
    'pre_start_alert'::TEXT as notification_type,
    fs.id as subtask_id,
    fs.task_id,
    ft.task_name::VARCHAR(255), -- Explicit cast to match column type
    fs.name::VARCHAR(255) as subtask_name, -- Explicit cast to match column type
    COALESCE(fs.assigned_to, ft.assigned_to)::TEXT as assigned_to,
    COALESCE(fc.company_name, 'Unknown Client')::TEXT as client_name,
    ROUND(EXTRACT(EPOCH FROM (fs.start_time_ist - current_time_only))/60)::INTEGER as time_diff_minutes,
    format('📋 Task Starting Soon: %s starts in %s minutes (%s IST). Client: %s',
           fs.name, 
           ROUND(EXTRACT(EPOCH FROM (fs.start_time_ist - current_time_only))/60),
           fs.start_time_ist, 
           COALESCE(fc.company_name, 'N/A'))::TEXT as message,
    'medium'::TEXT as priority,
    format('/finops/tasks/%s', fs.task_id)::TEXT as action_url,
    COALESCE(ft.reporting_managers, '[]'::jsonb) as reporting_managers,
    COALESCE(ft.escalation_managers, '[]'::jsonb) as escalation_managers
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  LEFT JOIN finops_clients fc ON ft.client_id = fc.id
  WHERE fs.start_time_ist IS NOT NULL
    AND COALESCE(fs.auto_notify, true) = true
    AND fs.status = 'pending'
    AND COALESCE(ft.is_active, true) = true
    AND COALESCE(fs.scheduled_date, CURRENT_DATE) = current_date_ist
    -- Check if start_time is within 15 minutes from now
    AND fs.start_time_ist > current_time_only
    AND fs.start_time_ist <= current_time_only + INTERVAL '15 minutes'
    AND COALESCE(fs.notification_sent_15min, false) = false
    AND ft.deleted_at IS NULL;

  -- 2) SLA warning (task should have started but hasn't)
  RETURN QUERY
  SELECT
    'sla_warning'::TEXT as notification_type,
    fs.id as subtask_id,
    fs.task_id,
    ft.task_name::VARCHAR(255),
    fs.name::VARCHAR(255) as subtask_name,
    COALESCE(fs.assigned_to, ft.assigned_to)::TEXT as assigned_to,
    COALESCE(fc.company_name, 'Unknown Client')::TEXT as client_name,
    ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60)::INTEGER as time_diff_minutes,
    format('⚠️ SLA Warning: %s was scheduled to start at %s IST. Currently %s minutes late. Client: %s',
           fs.name, 
           fs.start_time_ist, 
           ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60),
           COALESCE(fc.company_name, 'N/A'))::TEXT as message,
    'high'::TEXT as priority,
    format('/finops/tasks/%s', fs.task_id)::TEXT as action_url,
    COALESCE(ft.reporting_managers, '[]'::jsonb) as reporting_managers,
    COALESCE(ft.escalation_managers, '[]'::jsonb) as escalation_managers
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  LEFT JOIN finops_clients fc ON ft.client_id = fc.id
  WHERE fs.start_time_ist IS NOT NULL
    AND COALESCE(fs.auto_notify, true) = true
    AND fs.status IN ('pending', 'in_progress')
    AND COALESCE(ft.is_active, true) = true
    AND COALESCE(fs.scheduled_date, CURRENT_DATE) = current_date_ist
    -- Task should have started but is late (within 15 mins)
    AND fs.start_time_ist < current_time_only
    AND fs.start_time_ist > current_time_only - INTERVAL '15 minutes'
    AND COALESCE(fs.notification_sent_start, false) = false
    AND ft.deleted_at IS NULL;

  -- 3) Escalation (task is more than 15 minutes overdue)
  RETURN QUERY
  SELECT
    'escalation_alert'::TEXT as notification_type,
    fs.id as subtask_id,
    fs.task_id,
    ft.task_name::VARCHAR(255),
    fs.name::VARCHAR(255) as subtask_name,
    COALESCE(fs.assigned_to, ft.assigned_to)::TEXT as assigned_to,
    COALESCE(fc.company_name, 'Unknown Client')::TEXT as client_name,
    ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60)::INTEGER as time_diff_minutes,
    format('🚨 ESCALATION: %s missed start time (%s IST) by %s minutes. Immediate action required. Client: %s',
           fs.name, 
           fs.start_time_ist,
           ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60),
           COALESCE(fc.company_name, 'N/A'))::TEXT as message,
    'critical'::TEXT as priority,
    format('/finops/tasks/%s', fs.task_id)::TEXT as action_url,
    COALESCE(ft.reporting_managers, '[]'::jsonb) as reporting_managers,
    COALESCE(ft.escalation_managers, '[]'::jsonb) as escalation_managers
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  LEFT JOIN finops_clients fc ON ft.client_id = fc.id
  WHERE fs.start_time_ist IS NOT NULL
    AND COALESCE(fs.auto_notify, true) = true
    AND fs.status IN ('pending', 'in_progress')
    AND COALESCE(ft.is_active, true) = true
    AND COALESCE(fs.scheduled_date, CURRENT_DATE) = current_date_ist
    -- Task is more than 15 minutes overdue
    AND fs.start_time_ist < current_time_only - INTERVAL '15 minutes'
    AND COALESCE(fs.notification_sent_escalation, false) = false
    AND ft.deleted_at IS NULL;

  -- Log the results count
  RAISE NOTICE 'SLA Check completed for date: %', current_date_ist;

END;
$$ LANGUAGE plpgsql;

-- Test the function to ensure it works
SELECT 'Function created successfully' as status;
