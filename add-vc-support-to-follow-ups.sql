-- Add VC support to follow_ups table for VC step follow-ups

-- Add vc_id and vc_step_id columns to follow_ups table
ALTER TABLE follow_ups 
ADD COLUMN IF NOT EXISTS vc_id INTEGER REFERENCES vcs(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS vc_step_id INTEGER REFERENCES vc_steps(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_vc_id ON follow_ups(vc_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_vc_step_id ON follow_ups(vc_step_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_vc_context ON follow_ups(vc_id, vc_step_id);

-- Add constraint to ensure follow-up belongs to either lead or VC context (not both)
ALTER TABLE follow_ups 
ADD CONSTRAINT IF NOT EXISTS chk_follow_up_context 
CHECK (
  (lead_id IS NOT NULL AND vc_id IS NULL) OR 
  (lead_id IS NULL AND vc_id IS NOT NULL)
);

COMMENT ON COLUMN follow_ups.vc_id IS 'Reference to VC for VC-related follow-ups';
COMMENT ON COLUMN follow_ups.vc_step_id IS 'Reference to specific VC step for step-level follow-ups';
