-- E-ksena: let a responder see who is assigned to an incident (UC-15).
--
-- WHY THIS EXISTS
-- The incident card has to name the assigned responder, their unit and their
-- contact number. That lives in public.dispatch and public.responders, and a
-- signed-in responder can read neither: dispatch has row level security on
-- and no policy at all, and responders is limited to the caller's own entry
-- by supabase/responders-restrict-directory.sql. Asked directly, the database
-- answers with nothing, and the card can only say "Not yet assigned".
--
-- Opening either table would undo more than the card needs. A policy on
-- dispatch still leaves the name hidden, and a policy on responders puts the
-- whole personnel directory, mobile numbers included, back in front of every
-- account. So the card asks this function instead.
--
-- WHAT IT GIVES AWAY, AND TO WHOM
-- For an incident the caller's own service handles -- the same test the read
-- policy on reports applies -- it returns the dispatch record and the name,
-- office, service and number of whoever was assigned. For any other incident
-- it returns nothing. An admin may ask about any incident. That is narrower
-- than the directory used to be, but it is not nothing: a responder can now
-- learn the number of a colleague assigned to an incident of their service.
--
-- SECURITY DEFINER means this runs as its owner and is not subject to row
-- level security, so the authority check is written into the query itself.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: the function
-- ---------------------------------------------------------------------------
-- Dropped first because CREATE OR REPLACE cannot change the columns a function
-- returns, and this one may gain some. Ids travel as text, so the comparison
-- does not depend on how either table types its incident column.
DROP FUNCTION IF EXISTS public.incident_assignments(TEXT[]);

CREATE FUNCTION public.incident_assignments(incident_ids TEXT[])
RETURNS TABLE (
  dispatch_id TEXT,
  incident_id TEXT,
  responder_id TEXT,
  status TEXT,
  assigned_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  dispatch_phone_number TEXT,
  dispatch_service_type TEXT,
  responder_found BOOLEAN,
  responder_name TEXT,
  responder_office TEXT,
  responder_service_type TEXT,
  responder_phone_number TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id::TEXT,
    d.incident_id::TEXT,
    d.responder_id::TEXT,
    d.status::TEXT,
    d.assigned_at,
    d.dispatched_at,
    d.responder_phone_number::TEXT,
    d.service_type::TEXT,
    s.responder_id IS NOT NULL,
    s.name::TEXT,
    s.office::TEXT,
    s.service_type::TEXT,
    s.responder_phone_number::TEXT
  FROM public.dispatch d
  LEFT JOIN public.responders s ON s.responder_id = d.responder_id
  WHERE auth.uid() IS NOT NULL
    AND d.incident_id::TEXT = ANY (incident_ids)
    AND (
      EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.reports r
        WHERE r.incident_id::TEXT = d.incident_id::TEXT
          AND (
            public.responder_handles_type(r.classified_as)
            OR public.report_is_unassigned(r.classified_as)
          )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- PART 2: who may call it
-- ---------------------------------------------------------------------------
-- Supabase grants new functions to anon by default, so that is taken back
-- explicitly. The query also returns nothing without a signed-in caller.
REVOKE ALL ON FUNCTION public.incident_assignments(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.incident_assignments(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.incident_assignments(TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 3: check
-- ---------------------------------------------------------------------------
-- Impersonate a responder and ask about an incident that has a dispatch row.
-- The editor runs as an owner and bypasses row level security, so SET LOCAL
-- ROLE is what makes this a real test. Nothing is written.
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"PASTE-AUTH-USER-ID","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT * FROM public.incident_assignments(ARRAY['PASTE-INCIDENT-ID']);
--   ROLLBACK;
--
-- As a responder of the service that handles the incident: one row per
-- assignment, with the name filled in. As a responder of another service:
-- no rows. That second result is the function refusing, not failing.
