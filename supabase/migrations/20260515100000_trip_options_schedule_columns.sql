-- Apply if you already ran 20260515000000 before schedule columns were added.
-- Fresh installs: the main migration already includes these columns.

ALTER TABLE transit_lines
  ADD COLUMN IF NOT EXISTS station_sequence TEXT[] DEFAULT '{}';

ALTER TABLE trip_options
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS earliest_travel_time TEXT,
  ADD COLUMN IF NOT EXISTS last_travel_time TEXT,
  ADD COLUMN IF NOT EXISTS frequency TEXT,
  ADD COLUMN IF NOT EXISTS operates_24_7 BOOLEAN DEFAULT FALSE;

INSERT INTO transport_modes (slug, label, category) VALUES
  ('tnvs_grab', 'TNVS (Grab Sedan)', 'ride_hail'),
  ('taxi_airport', 'Airport Taxi (Yellow)', 'taxi'),
  ('ferry_pasig', 'Pasig River Ferry', 'ferry')
ON CONFLICT (slug) DO NOTHING;

-- Re-run CREATE OR REPLACE FUNCTION search_trip_options and
-- search_trip_options_by_text from 20260515000000_transit_trip_options.sql
-- (required so RPC return types include the new columns).
