-- ============================================================================
-- Add notifications table and image attachment support for sales leads
-- ============================================================================

-- Add image attachment column to follow-ups
ALTER TABLE IF EXISTS sales_leads_follow_ups 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_filename TEXT,
ADD COLUMN IF NOT EXISTS assigned_to_user_id INTEGER,
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- Create notifications table for follow-up alerts
CREATE TABLE IF NOT EXISTS sales_leads_notifications (
  id SERIAL PRIMARY KEY,
  
  -- Reference to follow-up
  follow_up_id INTEGER NOT NULL REFERENCES sales_leads_follow_ups(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
  
  -- User who should be notified
  user_id INTEGER,
  user_email TEXT,
  user_name TEXT,
  
  -- Notification details
  notification_type TEXT NOT NULL DEFAULT 'follow_up_due' CHECK (notification_type IN ('follow_up_due', 'follow_up_overdue', 'follow_up_completed')),
  title TEXT NOT NULL,
  message TEXT,
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  scheduled_for TIMESTAMP NOT NULL  -- When the follow-up is due
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_sales_leads_notifications_user_id ON sales_leads_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_notifications_user_email ON sales_leads_notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_sales_leads_notifications_is_read ON sales_leads_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_sales_leads_notifications_scheduled_for ON sales_leads_notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sales_leads_notifications_created_at ON sales_leads_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_leads_notifications_follow_up_id ON sales_leads_notifications(follow_up_id);

-- Create table to track daily follow-up alert runs (to avoid duplicate notifications)
CREATE TABLE IF NOT EXISTS sales_leads_notification_runs (
  id SERIAL PRIMARY KEY,
  run_date DATE NOT NULL UNIQUE,
  run_at TIMESTAMP DEFAULT NOW(),
  total_notifications_sent INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_notification_runs_date ON sales_leads_notification_runs(run_date DESC);
