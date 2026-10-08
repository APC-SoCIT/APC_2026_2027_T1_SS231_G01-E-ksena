-- E-ksena: close DEF-002 - restrict Row Level Security on reports.
--
-- WHY THIS EXISTS
-- supabase/reports-rls.sql created this policy:
--
--   CREATE POLICY "Allow all for reports" ON reports
--     FOR ALL USING (true) WITH CHECK (true);
--
-- FOR ALL with USING (true) grants SELECT, INSERT, UPDATE and DELETE to every
-- caller, including the anon key. That key ships inside the browser bundle, so
-- anyone who opens the deployed site can extract it and then read, alter or
-- delete every emergency report from outside the application. Verified against
-- the live database on 8 October 2026.
--
-- WHAT STILL WORKS AFTER THIS
--   - The dashboard: responders sign in, so they are 'authenticated'.
--   - The trigger create_report_from_ai_analysis: it is SECURITY DEFINER, which
--     runs as its owner and is not subject to these policies.
--   - The mobile backend: it holds the service-role key, which bypasses RLS.
--
-- WHAT STOPS WORKING
--   Anything that reads or writes reports with the anon key and no signed-in
--   user. If report submission breaks after this, that is the cause - see
--   PART 4 before reverting the whole file.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: remove the permissive policy
-- ---------------------------------------------------------------------------
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for reports" ON public.reports;

-- ---------------------------------------------------------------------------
-- PART 2: scoped replacements
-- ---------------------------------------------------------------------------
-- Read: any signed-in responder. The dashboard filters by service type in the
-- query; that is presentation, not security, so it is not relied on here.
DROP POLICY IF EXISTS "Authenticated read reports" ON public.reports;
CREATE POLICY "Authenticated read reports" ON public.reports
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Update: accepting, responding, resolving and reassigning.
DROP POLICY IF EXISTS "Authenticated update reports" ON public.reports;
CREATE POLICY "Authenticated update reports" ON public.reports
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Insert: kept for any in-app creation path that runs as a signed-in user.
-- The trigger and the backend do not need this.
DROP POLICY IF EXISTS "Authenticated insert reports" ON public.reports;
CREATE POLICY "Authenticated insert reports" ON public.reports
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Delete: no policy, on purpose. Under RLS that denies it to every application
-- role. Emergency records should not be removable from the client at all.

-- ---------------------------------------------------------------------------
-- PART 3: check
-- ---------------------------------------------------------------------------
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'reports'
ORDER BY cmd;
-- Expect exactly three rows: INSERT, SELECT, UPDATE. No DELETE, no ALL.

-- ---------------------------------------------------------------------------
-- PART 4: if citizen report submission breaks
-- ---------------------------------------------------------------------------
-- Do NOT restore "Allow all". Submission should route through the backend,
-- which holds the service-role key. If you need a stopgap for the demo, allow
-- inserts only - never select, update or delete:
--
--   CREATE POLICY "Anon insert reports" ON public.reports
--     FOR INSERT WITH CHECK (true);
--
-- That still leaves the data unreadable and undeletable from outside.
