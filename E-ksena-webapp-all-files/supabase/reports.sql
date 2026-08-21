-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) so saved reports
-- show in "All Tickets". Creates the reports table used by the app.

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: index for listing by newest first
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);

-- Allow the app to insert and read reports (use stricter RLS in production)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for reports" ON reports;
CREATE POLICY "Allow all for reports" ON reports
  FOR ALL
  USING (true)
  WITH CHECK (true);
