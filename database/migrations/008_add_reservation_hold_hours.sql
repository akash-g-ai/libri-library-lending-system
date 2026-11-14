-- Add reservation_hold_window_hours to library_settings.
-- The existing reservation_hold_window_days column is preserved for compatibility.
-- Phase 4 uses reservation_hold_window_hours for hold expiry calculations.
ALTER TABLE library_settings
  ADD COLUMN IF NOT EXISTS reservation_hold_window_hours INTEGER NOT NULL DEFAULT 48
  CHECK (reservation_hold_window_hours > 0);