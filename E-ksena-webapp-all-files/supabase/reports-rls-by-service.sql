-- E-ksena: scope report access to the responder's own service.
--
-- WHY THIS EXISTS
-- supabase/reports-rls-restrict.sql closed the "anyone holding the anon key"
-- hole, but it left this behind:
--
--   CREATE POLICY "Authenticated read reports" ON public.reports
--     FOR SELECT USING (auth.role() = 'authenticated');
--
-- So every signed-in responder can read AND update every report, whatever
-- service it belongs to. The dashboard only looks separated because it filters
-- on classified_as in the query. A medic with the browser console open can
-- still read and change a fire incident. Presentation is not access control.
--
-- THE MAPPING
--   responders.service_type    reports.classified_as
--     fire                       fire
--     medical                    medical, accident
--     police                     police, violence
-- This mirrors EMERGENCY_TYPES in lib/emergency.ts. Add a type there and it
-- must be added here too, or the new type becomes invisible to its service.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: who handles what
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the check still works once responders is restricted to
-- self and admins. search_path is pinned: a definer function that resolves
-- names through the caller's path can be hijacked by a same-named object.
CREATE OR REPLACE FUNCTION public.responder_handles_type(classified TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.responders r
    WHERE r.auth_user_id = auth.uid()
      AND COALESCE(r.is_active, true)
      AND lower(COALESCE(classified, '')) = ANY (
        CASE r.service_type
          WHEN 'fire'    THEN ARRAY['fire']
          WHEN 'medical' THEN ARRAY['medical', 'accident']
          WHEN 'police'  THEN ARRAY['police', 'violence']
          ELSE ARRAY[]::TEXT[]
        END
      )
  );
$$;

-- A report nobody owns must not vanish. If the AI has not classified it yet,
-- or wrote a value no service recognises, every responder should see it so it
-- can be triaged and reassigned -- an unseen emergency is worse than a report
-- read by the wrong service.
CREATE OR REPLACE FUNCTION public.report_is_unassigned(classified TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(COALESCE(classified, ''))
         NOT IN ('fire', 'medical', 'accident', 'police', 'violence');
$$;

-- ---------------------------------------------------------------------------
-- PART 2: replace the blanket policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read reports" ON public.reports;
DROP POLICY IF EXISTS "Responders read own service reports" ON public.reports;
CREATE POLICY "Responders read own service reports" ON public.reports
  FOR SELECT
  USING (
    public.responder_handles_type(classified_as)
    OR public.report_is_unassigned(classified_as)
    OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
  );

-- USING restricts which rows may be acted on: your own service's, or one no
-- service has claimed. WITH CHECK is deliberately looser, because reassigning
-- rewrites classified_as to another service -- requiring the row to still
-- match afterwards would make every handoff fail.
DROP POLICY IF EXISTS "Authenticated update reports" ON public.reports;
DROP POLICY IF EXISTS "Responders update own service reports" ON public.reports;
CREATE POLICY "Responders update own service reports" ON public.reports
  FOR UPDATE
  USING (
    public.responder_handles_type(classified_as)
    OR public.report_is_unassigned(classified_as)
    OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
  )
  WITH CHECK (auth.role() = 'authenticated');

-- INSERT is left exactly as reports-rls-restrict.sql set it. DELETE still has
-- no policy, which denies it to every application role.

-- ---------------------------------------------------------------------------
-- PART 3: check
-- ---------------------------------------------------------------------------
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'reports'
ORDER BY cmd;
-- Expect three rows: INSERT, SELECT, UPDATE. No DELETE, no ALL.

-- To prove it works, impersonate a responder in this editor. The editor runs
-- as an owner role, which bypasses RLS entirely, so SET LOCAL ROLE is what
-- makes the policies apply at all. Everything is inside a transaction that is
-- rolled back, so nothing is written.
--
-- Get a responder's id and service first:
--
--   SELECT auth_user_id, service_type FROM public.responders WHERE is_active;
--
-- Then, pasting that id in both places:
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"PASTE-AUTH-USER-ID","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT classified_as, count(*) FROM public.reports GROUP BY classified_as;
--   ROLLBACK;
--
-- A medic should see only medical and accident rows. Run the same block before
-- applying this file and it returns fire and police incidents as well -- that
-- pair of results is the evidence worth keeping.

-- ---------------------------------------------------------------------------
-- PART 4: if the dashboard goes empty
-- ---------------------------------------------------------------------------
-- Most likely the signed-in account has no row in responders, or its
-- service_type is not one of fire/medical/police. Check with:
--
--   SELECT auth_user_id, service_type, is_active FROM public.responders;
--
-- A responder whose record is missing sees nothing except unassigned reports.
-- That is the policy working, not a bug -- fix the record, do not loosen this.
