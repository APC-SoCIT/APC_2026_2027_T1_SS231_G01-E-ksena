-- Run this in Supabase SQL Editor to add the emergency status workflow
-- (Pending -> Matched -> Responding -> Resolved) used by the responder dashboards.

-- The live reports table still has user_id/incident_id as NOT NULL even though
-- supabase/reports-allow-null-user.sql already exists for this — it just was
-- never run. New emergencies (from the Makati intake form or self-filed
-- tickets) are inserted without a linked user/incident, so this is required
-- for saving to work at all. Safe to run even if already applied.
ALTER TABLE reports
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE reports
  ALTER COLUMN incident_id DROP NOT NULL;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'matched', 'responding', 'resolved'));

-- Records which responder (by username) accepted the emergency.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS responder_username TEXT;

-- Existing rows already have a classification and location, so treat them as
-- already matched rather than leaving them stuck at the new default.
UPDATE reports SET status = 'matched' WHERE status = 'pending';

-- Enable realtime change events for reports (safe to run even if already enabled).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE reports;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
