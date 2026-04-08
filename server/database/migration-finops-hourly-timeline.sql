-- Create finops_hourly_timeline table for storing hourly aggregated task status data
CREATE TABLE IF NOT EXISTS finops_hourly_timeline (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  hour_label VARCHAR(20) NOT NULL,
  pending_count INTEGER DEFAULT 0,
  inprogress_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  overdue_count INTEGER DEFAULT 0,
  delayed_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, hour)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_finops_hourly_timeline_date ON finops_hourly_timeline(date);
CREATE INDEX IF NOT EXISTS idx_finops_hourly_timeline_date_hour ON finops_hourly_timeline(date, hour);
CREATE INDEX IF NOT EXISTS idx_finops_hourly_timeline_updated_at ON finops_hourly_timeline(updated_at);
