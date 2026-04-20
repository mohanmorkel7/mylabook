-- ============================================================================
-- Lead Generation Management System - Database Schema
-- All sensitive fields encrypted with AES-256-CBC
-- Using "sales_leads" prefix to avoid conflicts with existing "leads" table
-- ============================================================================

-- Create Sales Leads table
CREATE TABLE IF NOT EXISTS sales_leads (
  id SERIAL PRIMARY KEY,

  -- Company Information (encrypted)
  company_name TEXT NOT NULL,
  company_legal_name TEXT,
  company_website TEXT,
  company_logo_url TEXT,

  -- Business Classification (encrypted)
  industry TEXT NOT NULL CHECK (industry IN ('Banking', 'Fintech', 'Payments', 'Insurance', 'Retail', 'Telecom', 'Government', 'Other')),
  sub_industry TEXT,
  company_size TEXT NOT NULL CHECK (company_size IN ('1-50', '51-200', '201-1000', '1001-5000', '5000+')),
  annual_revenue_band TEXT CHECK (annual_revenue_band IN ('<1M', '1-10M', '10-50M', '50-250M', '250M-1B', '1B+')),
  years_in_business INTEGER,

  -- Location (encrypted)
  country TEXT NOT NULL,
  state_region TEXT,
  city TEXT,
  address TEXT,
  timezone TEXT,
  preferred_language TEXT CHECK (preferred_language IN ('English', 'Hindi', 'Tamil', 'Kannada', 'Malayalam', 'Telugu', 'Marathi', 'Gujarati', 'Bengali', 'Punjabi', 'Urdu', 'Other')),

  -- Lead Source & Type (encrypted)
  source TEXT,
  client_type TEXT,
  pa_license TEXT,
  geography TEXT,
  txn_volume TEXT,

  -- Lead Source Details (encrypted)
  linkedin_profile_link TEXT,

  -- Payment Offerings & Contacts (JSON, encrypted)
  payment_offerings TEXT,
  contacts TEXT,

  -- Lead Status
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost')),
  is_draft BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_industry ON sales_leads(industry);
CREATE INDEX IF NOT EXISTS idx_sales_leads_country ON sales_leads(country);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created_at ON sales_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_leads_updated_at ON sales_leads(updated_at DESC);

-- Create Sales Leads Follow-ups table
CREATE TABLE IF NOT EXISTS sales_leads_follow_ups (
  id SERIAL PRIMARY KEY,

  -- Foreign Key
  lead_id INTEGER NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
  
  -- Follow-up Content (encrypted)
  notes TEXT,
  follow_up_date TIMESTAMP NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for follow-ups
CREATE INDEX IF NOT EXISTS idx_sales_leads_follow_ups_lead_id ON sales_leads_follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_follow_ups_follow_up_date ON sales_leads_follow_ups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_sales_leads_follow_ups_status ON sales_leads_follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_follow_ups_created_at ON sales_leads_follow_ups(created_at DESC);

-- Create Sales Leads Status History table (for analytics)
CREATE TABLE IF NOT EXISTS sales_leads_status_history (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT NOW(),
  changed_by TEXT
);

-- Create indexes for status history
CREATE INDEX IF NOT EXISTS idx_sales_leads_status_history_lead_id ON sales_leads_status_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status_history_changed_at ON sales_leads_status_history(changed_at DESC);

-- Create Sales Leads Activity Log table (for tracking interactions)
CREATE TABLE IF NOT EXISTS sales_leads_activity_log (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('created', 'updated', 'contacted', 'follow_up_added', 'status_changed', 'deleted')),
  activity_details TEXT,
  performed_by TEXT,
  performed_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for activity log
CREATE INDEX IF NOT EXISTS idx_sales_leads_activity_log_lead_id ON sales_leads_activity_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_activity_log_performed_at ON sales_leads_activity_log(performed_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sales_leads_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_leads_updated_at_trigger
BEFORE UPDATE ON sales_leads
FOR EACH ROW
EXECUTE FUNCTION update_sales_leads_timestamp();

-- Trigger to update follow-ups timestamp
CREATE OR REPLACE FUNCTION update_sales_leads_follow_ups_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_leads_follow_ups_updated_at_trigger
BEFORE UPDATE ON sales_leads_follow_ups
FOR EACH ROW
EXECUTE FUNCTION update_sales_leads_follow_ups_timestamp();

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION log_sales_leads_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO sales_leads_status_history (lead_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, 'system');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_leads_status_change_trigger
BEFORE UPDATE ON sales_leads
FOR EACH ROW
EXECUTE FUNCTION log_sales_leads_status_change();

-- Trigger to log activities
CREATE OR REPLACE FUNCTION log_sales_leads_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO sales_leads_activity_log (lead_id, activity_type, activity_details)
    VALUES (NEW.id, 'created', 'Lead created');
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO sales_leads_activity_log (lead_id, activity_type, activity_details)
    VALUES (NEW.id, 'updated', 'Lead updated');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_leads_activity_log_trigger
AFTER INSERT OR UPDATE ON sales_leads
FOR EACH ROW
EXECUTE FUNCTION log_sales_leads_activity();
