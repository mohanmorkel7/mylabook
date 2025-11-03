CREATE TABLE IF NOT EXISTS business_offer_steps (
  id SERIAL PRIMARY KEY,
  business_offering_id INTEGER REFERENCES business_offerings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  assigned_to INTEGER,
  due_date DATE,
  completed_date DATE,
  order_index INTEGER DEFAULT 0,
  probability_percent INTEGER DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
