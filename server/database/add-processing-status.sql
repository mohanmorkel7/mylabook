-- Add 'processing' status to mail_processing_log CHECK constraint
-- This migration updates the status CHECK constraint to include 'processing'

-- First, drop the old constraint
ALTER TABLE mail_processing_log
DROP CONSTRAINT mail_processing_log_status_check;

-- Add the new constraint with 'processing' status included
ALTER TABLE mail_processing_log
ADD CONSTRAINT mail_processing_log_status_check
CHECK (status IN ('processing', 'success', 'failed', 'skipped'));

-- Verify the constraint was added
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'mail_processing_log'
AND constraint_name = 'mail_processing_log_status_check';
