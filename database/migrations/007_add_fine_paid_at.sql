-- Add payment timestamp to fines for audit trail
ALTER TABLE fines ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;