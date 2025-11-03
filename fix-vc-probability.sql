-- Add probability_percent column to vc_steps table if it doesn't exist
ALTER TABLE vc_steps 
ADD COLUMN IF NOT EXISTS probability_percent DECIMAL(5,2);

-- Update existing VC steps to get probability_percent from their corresponding template steps
-- This assumes VCs were created from templates and step names match
UPDATE vc_steps vs
SET probability_percent = ts.probability_percent
FROM vcs v
JOIN template_steps ts ON (v.template_id = ts.template_id AND vs.name = ts.name)
WHERE vs.vc_id = v.id
  AND vs.probability_percent IS NULL;

-- For any remaining null values, use equal distribution per VC
UPDATE vc_steps vs
SET probability_percent = (
    SELECT ROUND((100.0 / COUNT(*))::numeric, 2)
    FROM vc_steps vs2
    WHERE vs2.vc_id = vs.vc_id
)
WHERE vs.probability_percent IS NULL;

-- Verify the results for VC 11
SELECT 
    vs.vc_id,
    vs.name,
    vs.order_index,
    vs.probability_percent,
    v.template_id,
    ts.probability_percent as template_probability
FROM vc_steps vs
JOIN vcs v ON vs.vc_id = v.id
LEFT JOIN template_steps ts ON (v.template_id = ts.template_id AND vs.name = ts.name)
WHERE vs.vc_id = 11
ORDER BY vs.order_index;
