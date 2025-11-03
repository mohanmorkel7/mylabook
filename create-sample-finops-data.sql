-- Create sample FinOps data for real-time testing
-- This will create tasks with IST times for testing auto-sync

-- Ensure required columns exist
ALTER TABLE finops_subtasks 
ADD COLUMN IF NOT EXISTS start_time_ist TIME,
ADD COLUMN IF NOT EXISTS end_time_ist TIME,
ADD COLUMN IF NOT EXISTS scheduled_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false;

-- Create a test client
INSERT INTO finops_clients (company_name, contact_person, email, phone, address, created_by)
VALUES ('ABC Corporation', 'User', 'user@abc.com', '+91-9999999999', 'Mumbai, India', 1)
ON CONFLICT (company_name) DO UPDATE SET contact_person = EXCLUDED.contact_person;

-- Create real-time test tasks with current IST times
WITH current_ist AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as ist_now
)
INSERT INTO finops_tasks (
  task_name, description, assigned_to, reporting_managers, escalation_managers,
  effective_from, duration, is_active, created_by, client_id
) 
SELECT 
  'Daily FinOps Task Example - IST Real-time',
  'Real-time task for testing auto-sync functionality',
  'User',
  '["Albert Kumar", "Hari Prasad"]'::jsonb,
  '["Sarah Wilson", "Mike Johnson"]'::jsonb,
  (SELECT ist_now::date FROM current_ist),
  'daily',
  true,
  1,
  (SELECT id FROM finops_clients WHERE company_name = 'ABC Corporation' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM finops_tasks WHERE task_name = 'Daily FinOps Task Example - IST Real-time'
);

-- Create subtasks with various IST times for testing
WITH 
current_ist AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as ist_now
),
task_info AS (
  SELECT id as task_id FROM finops_tasks 
  WHERE task_name = 'Daily FinOps Task Example - IST Real-time' 
  LIMIT 1
)
INSERT INTO finops_subtasks (
  task_id, name, description, assigned_to, sla_hours, sla_minutes, 
  status, start_time_ist, end_time_ist, scheduled_date, auto_notify,
  notification_sent_15min, notification_sent_start, notification_sent_escalation
)
SELECT 
  ti.task_id,
  subtask_data.name,
  subtask_data.description,
  'User',
  1, 0, -- 1 hour SLA
  'pending',
  subtask_data.start_time,
  subtask_data.end_time,
  (SELECT ist_now::date FROM current_ist),
  true,
  false, false, false
FROM task_info ti,
current_ist ci,
(VALUES 
  -- Task that should trigger pre-start alert (15 minutes from now)
  ('Task Updated', 'Test task for real-time notifications', 
   (ci.ist_now + INTERVAL '15 minutes')::time, 
   (ci.ist_now + INTERVAL '75 minutes')::time),
  
  -- Task that should trigger SLA warning (5 minutes overdue)
  ('Task Overdue by 5 min', 'Task that missed start time', 
   (ci.ist_now - INTERVAL '5 minutes')::time, 
   (ci.ist_now + INTERVAL '55 minutes')::time),
   
  -- Task that should trigger escalation (20 minutes overdue)
  ('Task Overdue by 20 min', 'Task requiring escalation', 
   (ci.ist_now - INTERVAL '20 minutes')::time, 
   (ci.ist_now + INTERVAL '40 minutes')::time)
) AS subtask_data(name, description, start_time, end_time)
WHERE NOT EXISTS (
  SELECT 1 FROM finops_subtasks fs 
  WHERE fs.task_id = ti.task_id AND fs.name = subtask_data.name
);

-- Update existing tasks to have proper priority values
UPDATE finops_subtasks SET 
  priority = 'medium'
WHERE priority IS NULL;

-- Add client_id to existing tasks
UPDATE finops_tasks SET 
  client_id = (SELECT id FROM finops_clients WHERE company_name = 'ABC Corporation' LIMIT 1)
WHERE client_id IS NULL;

-- Show the created data
SELECT 
  'Sample data created successfully' as status,
  COUNT(*) as tasks_created
FROM finops_tasks 
WHERE task_name LIKE '%Real-time%';

-- Show current IST time for reference
SELECT 
  'Current IST Time' as info,
  (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as current_ist_time;
