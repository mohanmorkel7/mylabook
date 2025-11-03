-- Ensure finops_alerts has a minutes_data column for compatibility with older alert loggers
ALTER TABLE IF NOT EXISTS finops_alerts
  ADD COLUMN IF NOT EXISTS minutes_data INTEGER;
