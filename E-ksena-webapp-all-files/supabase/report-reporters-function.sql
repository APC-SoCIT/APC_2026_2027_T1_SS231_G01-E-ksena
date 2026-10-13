-- E-ksena: let a responder see who reported an emergency.
--
-- WHY THIS EXISTS
-- The incident card shows the reporter: their name and the number they can be
-- reached on. A name is on the citizen's profile (public.users) and a number
-- on the incident their report came from (public.incidents), and a signed-in
-- responder can read neither table. Asked directly, the database answers with
-- nothing.
--
-- Opening either table would give away far more than the card needs: every
-- citizen's profile, date of birth included, and every incident of every
-- service. So the card asks this function instead.
--
-- WHAT IT GIVES AWAY, AND TO WHOM
-- For a report the caller's own service handles, or one not yet matched to a
-- service -- the same test the read policy on reports applies -- it returns
-- the reporter's name and one phone number. For any other report it returns
-- nothing. An admin may ask about any report. Nothing else from the profile
-- is returned: not the email address, not the date of birth.
--
-- SECURITY DEFINER means this runs as its owner and is not subject to row
-- level security, so the authority check is written into the query itself.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: the function
-- ---------------------------------------------------------------------------
-- Dropped first because CREATE OR REPLACE cannot change the columns a function
-- returns. Ids travel as text, so the comparison does not depend on how each
-- table types its id column.
--
-- The number on the incident is preferred, since it is the one the report was
-- made from, with the profile as a fallback. A value with no usable digits in
-- it is passed over: the phone app writes the word "unknown" on an incident
-- when it has no number to give, and that must not hide the one on the
-- profile.
DROP FUNCTION IF EXISTS public.report_reporters(TEXT[]);

CREATE FUNCTION public.report_reporters(report_ids TEXT[])
RETURNS TABLE (
  report_id TEXT,
  reporter_name TEXT,
  reporter_phone TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    rp.report_id::TEXT,
    NULLIF(btrim(u.full_name), '')::TEXT,
    COALESCE(
      CASE
        WHEN regexp_replace(COALESCE(i.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
        THEN btrim(i.user_phone_number)
      END,
      CASE
        WHEN regexp_replace(COALESCE(u.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
        THEN btrim(u.user_phone_number)
      END
    )::TEXT
  FROM public.reports rp
  LEFT JOIN public.incidents i ON i.incident_id::TEXT = rp.incident_id::TEXT
  LEFT JOIN public.users u ON u.user_id::TEXT = rp.user_id::TEXT
  WHERE auth.uid() IS NOT NULL
    AND rp.report_id::TEXT = ANY (report_ids)
    AND (
      public.responder_handles_type(rp.classified_as)
      OR public.report_is_unassigned(rp.classified_as)
      OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
    );
$$;

-- ---------------------------------------------------------------------------
-- PART 2: who may call it
-- ---------------------------------------------------------------------------
-- Supabase grants new functions to anon by default, so that is taken back
-- explicitly. The query also returns nothing without a signed-in caller.
REVOKE ALL ON FUNCTION public.report_reporters(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_reporters(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_reporters(TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 3: check
-- ---------------------------------------------------------------------------
-- How many reports have a reporter the card will be able to name or reach.
-- This runs as the editor's owner, so it counts every report.
SELECT
  count(*)                                        AS reports,
  count(*) FILTER (WHERE u.user_id IS NOT NULL)   AS with_a_profile,
  count(*) FILTER (WHERE NULLIF(btrim(u.full_name), '') IS NOT NULL) AS with_a_name,
  count(*) FILTER (
    WHERE regexp_replace(COALESCE(i.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
       OR regexp_replace(COALESCE(u.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
  )                                               AS with_a_number
FROM public.reports rp
LEFT JOIN public.incidents i ON i.incident_id::TEXT = rp.incident_id::TEXT
LEFT JOIN public.users u ON u.user_id::TEXT = rp.user_id::TEXT;

-- To test the access rule, impersonate a responder. The editor bypasses row
-- level security, so SET LOCAL ROLE is what makes this a real test. Nothing is
-- written.
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"PASTE-AUTH-USER-ID","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT * FROM public.report_reporters(ARRAY['PASTE-REPORT-ID']);
--   ROLLBACK;
--
-- As a responder of the service that handles the report: one row. As a
-- responder of another service: no rows. That second result is the function
-- refusing, not failing.
