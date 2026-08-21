-- Run this in Supabase SQL Editor if reports "Save" fails with permission/policy/RLS errors.
-- This allows the app (anon key) to insert and select from reports.

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for reports" ON reports;
CREATE POLICY "Allow all for reports" ON reports
  FOR ALL
  USING (true)
  WITH CHECK (true);
