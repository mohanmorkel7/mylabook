CREATE TABLE IF NOT EXISTS business_offerings (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  solution TEXT,
  product TEXT,
  avg_fee_value NUMERIC(10,3),
  avg_fee_currency TEXT, -- 'INR' or 'USD'
  mmgf_value NUMERIC(10,2),
  mmgf_unit TEXT, -- 'Lacs' or 'K'
  client_status TEXT,
  offering_description TEXT,
  current_daily_volume_bucket TEXT,
  projected_daily_volume_bucket TEXT,
  potential_mmgf_value NUMERIC(10,2),
  potential_mmgf_unit TEXT, -- 'Lacs' or 'K'
  potential_fee_value NUMERIC(10,3),
  potential_fee_currency TEXT, -- 'INR' or 'USD'
  potential_mrr_lacs NUMERIC(12,2),
  current_potential_arr_usd_mn NUMERIC(12,2),
  projected_potential_arr_usd_mn NUMERIC(12,2),
  template_id INTEGER DEFAULT 6,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
