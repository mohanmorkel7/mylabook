-- Extend fund_raises table to store full fund raise fields and drop unique vc mapping
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'fund_raises' AND constraint_type = 'UNIQUE' AND constraint_name = 'fund_raises_vc_id_key'
  ) THEN
    ALTER TABLE fund_raises DROP CONSTRAINT fund_raises_vc_id_key;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- constraint may have different name; ignore
END $$;

-- Make vc_id optional to allow records without strict VC mapping
ALTER TABLE fund_raises ALTER COLUMN vc_id DROP NOT NULL;

-- Add columns if not exist
ALTER TABLE fund_raises
  ADD COLUMN IF NOT EXISTS investor_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ui_status VARCHAR(20) DEFAULT 'WIP',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'in-progress',
  ADD COLUMN IF NOT EXISTS investor_status VARCHAR(50) DEFAULT 'WIP',
  ADD COLUMN IF NOT EXISTS round_stage VARCHAR(50),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS total_raise_mn NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS valuation_mn NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS fund_mn NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- Apply check constraints (drop then add to avoid duplicates)
ALTER TABLE fund_raises DROP CONSTRAINT IF EXISTS fund_raises_ui_status_check;
ALTER TABLE fund_raises ADD CONSTRAINT fund_raises_ui_status_check CHECK (ui_status IN ('WIP','Closed','Dropped'));

ALTER TABLE fund_raises DROP CONSTRAINT IF EXISTS fund_raises_status_check;
ALTER TABLE fund_raises ADD CONSTRAINT fund_raises_status_check CHECK (status IN ('in-progress','won','lost','completed'));

ALTER TABLE fund_raises DROP CONSTRAINT IF EXISTS fund_raises_investor_status_check;
ALTER TABLE fund_raises ADD CONSTRAINT fund_raises_investor_status_check CHECK (investor_status IN ('Pass','WIP','Closed','Yet to Connect','Future Potential'));

ALTER TABLE fund_raises DROP CONSTRAINT IF EXISTS fund_raises_round_stage_check;
ALTER TABLE fund_raises ADD CONSTRAINT fund_raises_round_stage_check CHECK (round_stage IN ('pre_seed','pre_series_a','seed','series_a','series_b','series_c','bridge','bridge_1','bridge_2','growth','ipo'));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_fund_raises_investor_name ON fund_raises(investor_name);
CREATE INDEX IF NOT EXISTS idx_fund_raises_status ON fund_raises(status);
CREATE INDEX IF NOT EXISTS idx_fund_raises_round_stage ON fund_raises(round_stage);
