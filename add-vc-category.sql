-- Add VC category to template_categories table
INSERT INTO template_categories (name, description, color, icon, sort_order, is_active, created_at, updated_at)
VALUES (
    'VC',
    'Venture Capital templates',
    '#8B5CF6',
    'TrendingUp',
    6,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (name) DO NOTHING;

-- Verify the insertion
SELECT * FROM template_categories WHERE name = 'VC';

-- Check what tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%template%';

-- Check the templates table structure if it exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'templates' AND table_schema = 'public'
ORDER BY ordinal_position;
