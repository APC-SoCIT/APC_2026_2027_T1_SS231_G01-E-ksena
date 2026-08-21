-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor).
-- Without this, "Accept" on the Map tab appears to work but silently fails:
-- the app tries to write status/responder_username, Postgres rejects the
-- update because the columns don't exist, and the next refresh just shows
-- the emergency back as "Matched" again.
--
-- Adds the status and responder_username columns used by the Map/Reports
-- screens for the Pending -> Matched -> Responding -> Resolved workflow.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'matched'
    CHECK (status IN ('pending', 'matched', 'responding', 'resolved'));

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS responder_username TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
