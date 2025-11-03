-- FinOps SLA Notification System with IST Timezone Support
-- This migration creates the enhanced notification logic as per requirements

-- Add required columns to finops_subtasks for IST handling
ALTER TABLE finops_subtasks 
ADD COLUMN IF NOT EXISTS start_time_ist TIME,
ADD COLUMN IF NOT EXISTS end_time_ist TIME,
ADD COLUMN IF NOT EXISTS scheduled_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false;

-- Ensure old versions are removed to avoid return type conflicts
DROP FUNCTION IF EXISTS check_subtask_sla_notifications_ist() CASCADE;

-- Create the enhanced SLA notification function
CREATE OR REPLACE FUNCTION check_subtask_sla_notifications_ist()
RETURNS TABLE(
  notification_type TEXT,
  subtask_id INTEGER,
  task_id INTEGER,
  task_name TEXT,
  subtask_name TEXT,
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
  
  -- 1) Pre-start notification (15 minutes before start time)
  -- Alert user 15 minutes before task start time (e.g., 4:45pm IST for 5:00pm task)
  RETURN QUERY
  SELECT
    'pre_start_alert'::TEXT as notification_type,
    fs.id as subtask_id,
    fs.task_id,
    ft.task_name::TEXT as task_name,
    fs.name::TEXT as subtask_name,
    COALESCE(fs.assigned_to, ft.assigned_to)::TEXT as assigned_to,
    COALESCE(fc.company_name, 'Unknown Client')::TEXT as client_name,
    ROUND(EXTRACT(EPOCH FROM (fs.start_time_ist - current_time_only))/60)::INT as time_diff_minutes,
    format('📋 Task Starting Soon: %s starts in 15 minutes (%s IST). Client: %s',
           fs.name, fs.start_time_ist, COALESCE(fc.company_name, 'N/A')) as message,
    'medium'::TEXT as priority,
    format('/finops/tasks/%s', fs.task_id) as action_url,
    ft.reporting_managers,
    ft.escalation_managers
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  LEFT JOIN finops_clients fc ON ft.client_id = fc.id
  WHERE fs.start_time_ist IS NOT NULL
    AND fs.auto_notify = true
    AND fs.status = 'pending'
    AND ft.is_active = true
    AND fs.scheduled_date = current_date_ist
    -- Check if start_time is exactly 15 minutes from now
    AND fs.start_time_ist > current_time_only
    AND fs.start_time_ist <= current_time_only + INTERVAL '15 minutes'
    AND fs.notification_sent_15min = false
    AND ft.deleted_at IS NULL;

  -- 2) SLA warning (if user doesn't start task on time and status changes from pending to in-progress after start time)
  RETURN QUERY
  SELECT
    'sla_warning'::TEXT as notification_type,
    fs.id as subtask_id,
    fs.task_id,
    ft.task_name::TEXT as task_name,
    fs.name::TEXT as subtask_name,
    COALESCE(fs.assigned_to, ft.assigned_to)::TEXT as assigned_to,
    COALESCE(fc.company_name, 'Unknown Client')::TEXT as client_name,
    ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60)::INT as time_diff_minutes,
    format('⚠️ SLA Warning: %s was scheduled to start at %s IST. Currently %s minutes late. Client: %s',
           fs.name, fs.start_time_ist, 
           ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60),
           COALESCE(fc.company_name, 'N/A')) as message,
    'high'::TEXT as priority,
    format('/finops/tasks/%s', fs.task_id) as action_url,
    ft.reporting_managers,
    ft.escalation_managers
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  LEFT JOIN finops_clients fc ON ft.client_id = fc.id
  WHERE fs.start_time_ist IS NOT NULL
    AND fs.auto_notify = true
    AND fs.status IN ('pending', 'in_progress')
    AND ft.is_active = true
    AND fs.scheduled_date = current_date_ist
    -- Task should have started but hasn't been completed
    AND fs.start_time_ist < current_time_only
    AND fs.start_time_ist > current_time_only - INTERVAL '15 minutes' -- Within 15 mins of missing start time
    AND fs.notification_sent_start = false
    AND ft.deleted_at IS NULL;

  -- 3) Escalation (if task is still missed after 15 minutes from start time)
  RETURN QUERY
  SELECT
    'escalation_alert'::TEXT as notification_type,
    fs.id as subtask_id,
    fs.task_id,
    ft.task_name::TEXT as task_name,
    fs.name::TEXT as subtask_name,
    COALESCE(fs.assigned_to, ft.assigned_to)::TEXT as assigned_to,
    COALESCE(fc.company_name, 'Unknown Client')::TEXT as client_name,
    ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60)::INT as time_diff_minutes,
    format('🚨 ESCALATION: %s missed start time (%s IST) by %s minutes. Immediate action required. Client: %s',
           fs.name, fs.start_time_ist,
           ROUND(EXTRACT(EPOCH FROM (current_time_only - fs.start_time_ist))/60),
           COALESCE(fc.company_name, 'N/A')) as message,
    'critical'::TEXT as priority,
    format('/finops/tasks/%s', fs.task_id) as action_url,
    ft.reporting_managers,
    ft.escalation_managers
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  LEFT JOIN finops_clients fc ON ft.client_id = fc.id
  WHERE fs.start_time_ist IS NOT NULL
    AND fs.auto_notify = true
    AND fs.status IN ('pending', 'in_progress')
    AND ft.is_active = true
    AND fs.scheduled_date = current_date_ist
    -- Task is more than 15 minutes overdue
    AND fs.start_time_ist < current_time_only - INTERVAL '15 minutes'
    AND fs.notification_sent_escalation = false
    AND ft.deleted_at IS NULL;

END;
$$ LANGUAGE plpgsql;

-- Create function to reset daily tasks and notifications
DROP FUNCTION IF EXISTS reset_daily_finops_tasks() CASCADE;
CREATE OR REPLACE FUNCTION reset_daily_finops_tasks()
RETURNS void AS $$
DECLARE
  task_record RECORD;
  current_time_ist TIMESTAMP;
  current_date_ist DATE;
BEGIN
  -- Convert current UTC time to IST (UTC+5:30)
  current_time_ist := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata');
  current_date_ist := (current_time_ist)::DATE;
  
  -- Reset daily tasks (only if it's a new day and tasks are scheduled for today)
  FOR task_record IN 
    SELECT t.id, t.task_name
    FROM finops_tasks t
    WHERE t.duration = 'daily'
    AND t.is_active = true
    AND t.effective_from <= current_date_ist
    AND t.deleted_at IS NULL
  LOOP
    -- Reset subtasks for today
    UPDATE finops_subtasks 
    SET 
      status = 'pending',
      started_at = NULL,
      completed_at = NULL,
      scheduled_date = current_date_ist,
      notification_sent_15min = false,
      notification_sent_start = false,
      notification_sent_escalation = false,
      updated_at = CURRENT_TIMESTAMP
    WHERE task_id = task_record.id
    AND (scheduled_date != current_date_ist OR scheduled_date IS NULL);
    
    -- Update task last run time
    UPDATE finops_tasks 
    SET last_run_at = current_time_ist,
        next_run_at = current_time_ist + INTERVAL '1 day'
    WHERE id = task_record.id;
    
    -- Log the daily reset
    INSERT INTO finops_activity_log (task_id, action, user_name, details)
    VALUES (task_record.id, 'daily_reset', 'System', 
            format('Daily task reset for %s (IST)', current_date_ist));
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to mark notifications as sent
DROP FUNCTION IF EXISTS mark_notification_sent(INTEGER, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION mark_notification_sent(
  p_subtask_id INTEGER,
  p_notification_type TEXT
)
RETURNS void AS $$
BEGIN
  CASE p_notification_type
    WHEN 'pre_start_alert' THEN
      UPDATE finops_subtasks 
      SET notification_sent_15min = true 
      WHERE id = p_subtask_id;
    WHEN 'sla_warning' THEN
      UPDATE finops_subtasks 
      SET notification_sent_start = true 
      WHERE id = p_subtask_id;
    WHEN 'escalation_alert' THEN
      UPDATE finops_subtasks 
      SET notification_sent_escalation = true 
      WHERE id = p_subtask_id;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create function to move completed notifications to activity log
DROP FUNCTION IF EXISTS archive_completed_notifications() CASCADE;
CREATE OR REPLACE FUNCTION archive_completed_notifications()
RETURNS void AS $$
BEGIN
  -- Move completed task notifications to activity log instead of keeping in notifications
  INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details, timestamp)
  SELECT 
    fs.task_id,
    fs.id,
    'task_completed',
    COALESCE(fs.assigned_to, ft.assigned_to),
    format('Task completed: %s', fs.name),
    fs.completed_at
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  WHERE fs.status = 'completed'
  AND fs.completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM finops_activity_log fal
    WHERE fal.task_id = fs.task_id
    AND fal.subtask_id = fs.id
    AND fal.action = 'task_completed'
    AND fal.timestamp = fs.completed_at
  );
  
  -- Move overdue notifications to activity log
  INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details, timestamp)
  SELECT 
    fs.task_id,
    fs.id,
    'task_overdue',
    COALESCE(fs.assigned_to, ft.assigned_to),
    format('Task overdue: %s', fs.name),
    CURRENT_TIMESTAMP
  FROM finops_subtasks fs
  LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
  WHERE fs.status = 'overdue'
  AND NOT EXISTS (
    SELECT 1 FROM finops_activity_log fal
    WHERE fal.task_id = fs.task_id
    AND fal.subtask_id = fs.id
    AND fal.action = 'task_overdue'
    AND DATE(fal.timestamp) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_finops_subtasks_start_time_ist ON finops_subtasks(start_time_ist);
CREATE INDEX IF NOT EXISTS idx_finops_subtasks_scheduled_date ON finops_subtasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_finops_subtasks_status_active ON finops_subtasks(status) WHERE auto_notify = true;
CREATE INDEX IF NOT EXISTS idx_finops_tasks_daily_active ON finops_tasks(duration, is_active) WHERE duration = 'daily';

-- Create trigger to automatically set IST times when subtask is created/updated
CREATE OR REPLACE FUNCTION update_ist_times()
RETURNS TRIGGER AS $$
BEGIN
  -- If start_time_ist is not set but we have other time information, calculate it
  IF NEW.start_time_ist IS NULL AND NEW.started_at IS NOT NULL THEN
    NEW.start_time_ist := (NEW.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::TIME;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ist_times ON finops_subtasks;
CREATE TRIGGER trigger_update_ist_times
  BEFORE INSERT OR UPDATE ON finops_subtasks
  FOR EACH ROW
  EXECUTE FUNCTION update_ist_times();
