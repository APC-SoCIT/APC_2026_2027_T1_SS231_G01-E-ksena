-- E-ksena: let a responder hand an incident to another service.
--
-- WHY THIS EXISTS
-- A responder who opens a report, watches the video and finds it belongs to
-- another service has to be able to pass it on. Reassignment rewrites
-- classified_as to a value outside their own scope, and every attempt to
-- express that as a Row Level Security policy was rejected with
--
--   new row violates row-level security policy for table "reports"
--
-- even with WITH CHECK reduced to auth.uid() IS NOT NULL, with auth.uid()
-- confirmed non-null in the same session and no triggers on the table. The
-- new row is being judged against the service scope somewhere the policy
-- definitions do not show.
--
-- Rather than keep bending the policy around that, the handoff is a function.
-- It is also the better place for it: who may reassign what is a rule about
-- dispatch, not about row visibility, and written here it can be read.
--
-- SECURITY
-- SECURITY DEFINER means this runs as the owner and is not subject to RLS, so
-- the authority check is inside it and is the same one the read policy uses:
-- you may reassign a report your service currently holds, or one no service
-- has claimed, or anything at all if you are an admin. A responder cannot
-- reach another service's incidents through this -- those rows simply do not
-- match, and the function reports how many it changed.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: the function
-- ---------------------------------------------------------------------------
-- report_ids arrives as text and the column is cast to match, so this keeps
-- working whether report_id is a uuid, a bigint or text.
CREATE OR REPLACE FUNCTION public.reassign_reports(report_ids TEXT[], new_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated INTEGER;
  wanted TEXT := lower(trim(new_type));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;

  -- Mirrors EMERGENCY_TYPES in lib/emergency.ts. An unrecognised value would
  -- leave the report invisible to every service, so it is refused here.
  IF wanted NOT IN ('fire', 'medical', 'accident', 'police', 'violence') THEN
    RAISE EXCEPTION 'Unknown emergency type: %', new_type;
  END IF;

  UPDATE public.reports r
  SET classified_as = wanted
  WHERE r.report_id::TEXT = ANY (report_ids)
    AND (
      public.responder_handles_type(r.classified_as)
      OR public.report_is_unassigned(r.classified_as)
      OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
    );

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- ---------------------------------------------------------------------------
-- PART 2: who may call it
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reassign_reports(TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_reports(TEXT[], TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 3: check
-- ---------------------------------------------------------------------------
-- Impersonate a medic and hand one of their reports to the fire service. The
-- editor runs as an owner and bypasses RLS, so SET LOCAL ROLE is what makes
-- this a real test. The transaction is rolled back, so nothing is written.
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"PASTE-AUTH-USER-ID","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT public.reassign_reports(
--     ARRAY[(SELECT report_id::TEXT FROM public.reports WHERE classified_as = 'medical' LIMIT 1)],
--     'fire'
--   ) AS rows_changed;
--   ROLLBACK;
--
-- Expect rows_changed = 1. Passing a report belonging to another service
-- returns 0 rather than an error: nothing matched, which is the point.
