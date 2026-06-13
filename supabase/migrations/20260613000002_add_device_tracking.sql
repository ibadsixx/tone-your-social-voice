ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS location TEXT;
