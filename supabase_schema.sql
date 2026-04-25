-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Locations Table
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'terminal', 'station', 'mall', 'city_hall'
  coordinates GEOGRAPHY(POINT) NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Routes Table
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_id UUID REFERENCES locations(id),
  destination_id UUID REFERENCES locations(id),
  raw_origin TEXT,
  raw_destination TEXT,
  vehicle_type TEXT NOT NULL, -- 'jeepney', 'modern_jeepney', 'bus', 'aircon_bus', 'train'
  path GEOGRAPHY(LINESTRING),
  steps JSONB,
  data_source TEXT DEFAULT 'official', -- 'official' or 'reddit'
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fares Table
CREATE TABLE IF NOT EXISTS fares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type TEXT NOT NULL UNIQUE,
  base_fare DECIMAL NOT NULL,
  base_distance DECIMAL NOT NULL, -- in km
  per_km_fare DECIMAL NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'traffic', 'closure', 'accident'
  description TEXT NOT NULL,
  location GEOGRAPHY(POINT),
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert 2026 Fare Rates
INSERT INTO fares (vehicle_type, base_fare, base_distance, per_km_fare)
VALUES 
  ('jeepney', 14.00, 4, 1.50),
  ('modern_jeepney', 17.00, 4, 1.80),
  ('bus', 15.00, 5, 2.25),
  ('aircon_bus', 18.00, 5, 2.65)
ON CONFLICT (vehicle_type) DO UPDATE 
SET base_fare = EXCLUDED.base_fare, 
    per_km_fare = EXCLUDED.per_km_fare;
