-- ============================================================================
-- Rename Lead Generation Management tables to avoid conflicts
-- ============================================================================

-- Rename leads table
ALTER TABLE IF EXISTS leads RENAME TO sales_leads;

-- Rename follow-ups table
ALTER TABLE IF EXISTS lead_follow_ups RENAME TO sales_leads_follow_ups;

-- Rename status history table
ALTER TABLE IF EXISTS lead_status_history RENAME TO sales_leads_status_history;

-- Rename activity log table
ALTER TABLE IF EXISTS lead_activity_log RENAME TO sales_leads_activity_log;

-- Rename indexes
ALTER INDEX IF EXISTS idx_leads_status RENAME TO idx_sales_leads_status;
ALTER INDEX IF EXISTS idx_leads_industry RENAME TO idx_sales_leads_industry;
ALTER INDEX IF EXISTS idx_leads_country RENAME TO idx_sales_leads_country;
ALTER INDEX IF EXISTS idx_leads_created_at RENAME TO idx_sales_leads_created_at;
ALTER INDEX IF EXISTS idx_leads_updated_at RENAME TO idx_sales_leads_updated_at;
ALTER INDEX IF EXISTS idx_follow_ups_lead_id RENAME TO idx_sales_leads_follow_ups_lead_id;
ALTER INDEX IF EXISTS idx_follow_ups_follow_up_date RENAME TO idx_sales_leads_follow_ups_follow_up_date;
ALTER INDEX IF EXISTS idx_follow_ups_status RENAME TO idx_sales_leads_follow_ups_status;
ALTER INDEX IF EXISTS idx_follow_ups_created_at RENAME TO idx_sales_leads_follow_ups_created_at;
ALTER INDEX IF EXISTS idx_lead_status_history_lead_id RENAME TO idx_sales_leads_status_history_lead_id;
ALTER INDEX IF EXISTS idx_lead_status_history_changed_at RENAME TO idx_sales_leads_status_history_changed_at;
ALTER INDEX IF EXISTS idx_lead_activity_log_lead_id RENAME TO idx_sales_leads_activity_log_lead_id;
ALTER INDEX IF EXISTS idx_lead_activity_log_performed_at RENAME TO idx_sales_leads_activity_log_performed_at;

-- Rename triggers
ALTER TRIGGER IF EXISTS lead_updated_at_trigger ON sales_leads RENAME TO sales_leads_updated_at_trigger;
ALTER TRIGGER IF EXISTS follow_ups_updated_at_trigger ON sales_leads_follow_ups RENAME TO sales_leads_follow_ups_updated_at_trigger;
ALTER TRIGGER IF EXISTS lead_status_change_trigger ON sales_leads RENAME TO sales_leads_status_change_trigger;
ALTER TRIGGER IF EXISTS lead_activity_log_trigger ON sales_leads RENAME TO sales_leads_activity_log_trigger;

-- Update foreign key constraints in follow-ups table
ALTER TABLE sales_leads_follow_ups 
DROP CONSTRAINT IF EXISTS lead_follow_ups_lead_id_fkey,
ADD CONSTRAINT sales_leads_follow_ups_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE;

-- Update foreign key constraints in status history table
ALTER TABLE sales_leads_status_history 
DROP CONSTRAINT IF EXISTS lead_status_history_lead_id_fkey,
ADD CONSTRAINT sales_leads_status_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE;

-- Update foreign key constraints in activity log table
ALTER TABLE sales_leads_activity_log 
DROP CONSTRAINT IF EXISTS lead_activity_log_lead_id_fkey,
ADD CONSTRAINT sales_leads_activity_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE;
