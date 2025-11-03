-- Add template_id column to vcs table
-- This allows VCs to be associated with workflow templates

-- Add the template_id column
ALTER TABLE vcs ADD COLUMN IF NOT EXISTS template_id INTEGER;

-- Add a foreign key constraint to reference the onboarding_templates table
ALTER TABLE vcs ADD CONSTRAINT fk_vcs_template_id 
    FOREIGN KEY (template_id) REFERENCES onboarding_templates(id) ON DELETE SET NULL;

-- Add an index for better performance when querying by template
CREATE INDEX IF NOT EXISTS idx_vcs_template_id ON vcs(template_id);

-- Verify the column was added
\d vcs;

-- Show any existing VCs that don't have a template_id (should be all of them initially)
SELECT id, vc_id, round_title, template_id 
FROM vcs 
WHERE template_id IS NULL 
ORDER BY created_at DESC 
LIMIT 10;
