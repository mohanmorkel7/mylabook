-- Database-side FinOps auto sync (no app needed)

-- Convenience runner that resets daily tasks, generates SLA notifications (IST), and archives
CREATE OR REPLACE FUNCTION run_finops_auto_sync()
RETURNS void AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Daily reset (idempotent)
  PERFORM reset_daily_finops_tasks();

  -- Generate SLA notifications from IST-aware function
  FOR rec IN SELECT * FROM check_subtask_sla_notifications_ist() LOOP
    -- Mark as sent to avoid duplicates
    BEGIN
      PERFORM mark_notification_sent(rec.subtask_id, rec.notification_type);
    EXCEPTION WHEN others THEN
      -- ignore marking errors
      NULL;
    END;

    -- Map type to action and insert activity log (dedupe via ON CONFLICT DO NOTHING)
    INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
    VALUES (
      CASE 
        WHEN rec.notification_type = 'pre_start_alert' THEN 'pre_start_notification'
        WHEN rec.notification_type = 'sla_warning' THEN 'sla_alert'
        WHEN rec.notification_type = 'escalation_alert' THEN 'escalation_notification'
        ELSE 'overdue_notification_sent'
      END,
      rec.task_id,
      rec.subtask_id,
      'System',
      rec.message,
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Archive completed/overdue into activity log
  PERFORM archive_completed_notifications();
END;
$$ LANGUAGE plpgsql;

-- Optional: schedule via pg_cron if available (runs every 5 minutes)
DO $$
BEGIN
  -- Try to enable pg_cron (may require superuser, ignore failures)
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron not available: %', SQLERRM;
  END;

  -- Try named schedule first (pg_cron >= 1.5)
  BEGIN
    PERFORM cron.schedule('finops_auto_sync', '*/5 * * * *', 'SELECT run_finops_auto_sync();');
  EXCEPTION WHEN undefined_function THEN
    -- Fallback to older 2-arg signature
    BEGIN
      PERFORM cron.schedule('*/5 * * * *', 'SELECT run_finops_auto_sync();');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not register pg_cron job: %', SQLERRM;
    END;
  WHEN others THEN
    RAISE NOTICE 'Could not register pg_cron job (named): %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql;
