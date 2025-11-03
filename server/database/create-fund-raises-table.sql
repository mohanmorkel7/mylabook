-- Fund Raises mapping table (maps to existing VCs)
CREATE TABLE IF NOT EXISTS fund_raises (
    id SERIAL PRIMARY KEY,
    vc_id INTEGER NOT NULL UNIQUE REFERENCES vcs(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure update timestamp trigger function exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
    ) THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE 'plpgsql';
    END IF;
END $$ LANGUAGE plpgsql;

-- Apply trigger to fund_raises table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'fund_raises'
          AND trigger_name = 'update_fund_raises_updated_at'
    ) THEN
        CREATE TRIGGER update_fund_raises_updated_at
        BEFORE UPDATE ON fund_raises
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$ LANGUAGE plpgsql;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_fund_raises_vc_id ON fund_raises(vc_id);
CREATE INDEX IF NOT EXISTS idx_fund_raises_created_at ON fund_raises(created_at);
