-- Migration: add ever_overdue and overdue_at to tickets

ALTER TABLE IF EXISTS tickets
ADD COLUMN IF NOT EXISTS ever_overdue BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS overdue_at TIMESTAMP WITH TIME ZONE NULL;

-- Backfill overdue_at for existing tickets where sla_time is in the past or status name includes 'overdue'
DO $$
BEGIN
  UPDATE tickets t
  SET ever_overdue = TRUE,
      overdue_at = COALESCE(overdue_at, NOW())
  WHERE (t.sla_time IS NOT NULL AND t.sla_time <= NOW())
     OR EXISTS (
       SELECT 1 FROM ticket_statuses ts WHERE ts.id = t.status_id AND LOWER(ts.name) LIKE '%overdue%'
     );
END$$;
