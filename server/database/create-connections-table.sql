-- Create connections table for Contact/Member management
CREATE TABLE IF NOT EXISTS connections (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NULL CHECK (type IN (
    'Business Team',
    'Internal Team',
    'VC',
    'Advisory Board',
    'Consultants',
    'Client',
    'General'
  )),
  phone_prefix VARCHAR(10) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255),
  country VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for quick filtering/search
CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(type);
CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_connections_email ON connections(LOWER(email));
