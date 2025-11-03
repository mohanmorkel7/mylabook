-- Update investor_category constraint to include additional options
ALTER TABLE vcs DROP CONSTRAINT IF EXISTS vcs_investor_category_check;
ALTER TABLE vcs ADD CONSTRAINT vcs_investor_category_check
  CHECK (investor_category IN (
    'angel', 'vc', 'private_equity', 'family_office', 'merchant_banker', 'accelerator', 'individual',
    'early_stage', 'growth', 'strategic_bank', 'strategic_fintech', 'strategic_individual'
  ));
