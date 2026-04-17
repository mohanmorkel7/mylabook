-- Extend follow-up statuses to include Delayed and Overdue, and add delay tracking
ALTER TABLE IF EXISTS sales_leads_follow_ups 
DROP CONSTRAINT IF EXISTS sales_leads_follow_ups_status_check;

ALTER TABLE IF EXISTS sales_leads_follow_ups 
ADD CONSTRAINT sales_leads_follow_ups_status_check 
CHECK (status IN ('Pending', 'Completed', 'Cancelled', 'Delayed', 'Overdue'));

-- Add fields to track delays
ALTER TABLE IF EXISTS sales_leads_follow_ups 
ADD COLUMN IF NOT EXISTS delayed_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS source TEXT;

-- Also add assigned_users (for multiple user support) - stored as comma-separated IDs
ALTER TABLE IF EXISTS sales_leads_follow_ups 
ADD COLUMN IF NOT EXISTS assigned_users TEXT;

-- Create index for delayed follow-ups
CREATE INDEX IF NOT EXISTS idx_sales_leads_follow_ups_delayed_until ON sales_leads_follow_ups(delayed_until);
CREATE INDEX IF NOT EXISTS idx_sales_leads_follow_ups_delayed_status ON sales_leads_follow_ups(status) WHERE status = 'Delayed';
