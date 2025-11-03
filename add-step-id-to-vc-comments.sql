-- Add step_id field to vc_comments table to support step-level chat functionality
-- This allows VC comments to be associated with specific VC steps

ALTER TABLE vc_comments 
ADD COLUMN IF NOT EXISTS step_id INTEGER REFERENCES vc_steps(id) ON DELETE CASCADE;

-- Add message_type and is_rich_text columns for better chat functionality
ALTER TABLE vc_comments 
ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS is_rich_text BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]';

-- Create index for better performance when querying by step_id
CREATE INDEX IF NOT EXISTS idx_vc_comments_step_id ON vc_comments(step_id);

-- Create index for better performance when querying by vc_id and step_id together  
CREATE INDEX IF NOT EXISTS idx_vc_comments_vc_step ON vc_comments(vc_id, step_id);

-- Update existing comments to have default values
UPDATE vc_comments 
SET message_type = 'text', 
    is_rich_text = false, 
    attachments = '[]' 
WHERE message_type IS NULL OR is_rich_text IS NULL OR attachments IS NULL;
