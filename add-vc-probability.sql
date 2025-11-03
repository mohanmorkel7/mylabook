-- Add probability_percent column to vc_steps table
-- This matches the structure of lead_steps table

ALTER TABLE vc_steps 
ADD COLUMN IF NOT EXISTS probability_percent DECIMAL(5,2);

-- Update existing records with calculated percentages based on equal distribution per VC
UPDATE vc_steps 
SET probability_percent = (
    SELECT ROUND((100.0 / COUNT(*))::numeric, 2)
    FROM vc_steps vs2 
    WHERE vs2.vc_id = vc_steps.vc_id
)
WHERE probability_percent IS NULL;

-- Show the updated data
SELECT vc_id, name, order_index, probability_percent 
FROM vc_steps 
WHERE vc_id = 11 
ORDER BY order_index;
