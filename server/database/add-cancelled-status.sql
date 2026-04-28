-- Add support for Cancelled status in follow-ups
ALTER TABLE IF EXISTS sales_leads_follow_ups 
DROP CONSTRAINT IF EXISTS sales_leads_follow_ups_status_check;

ALTER TABLE IF EXISTS sales_leads_follow_ups 
ADD CONSTRAINT sales_leads_follow_ups_status_check 
CHECK (status IN ('Pending', 'Completed', 'Cancelled'));
