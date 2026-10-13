-- E-ksena: let a responder see who reported an emergency.
--
-- WHY THIS EXISTS
-- The incident card shows the reporter: their name and the number they can be
-- reached on. A signed-in responder can read none of the places those are
-- kept, so asked directly, the database answers with nothing.
--
-- Opening those tables would give away far more than the card needs: every
-- citizen's profile, date of birth included, and every incident of every
-- service. So the card asks this function instead.
--
-- WHERE A NAME AND A NUMBER ARE KEPT
-- Not in one place, because of how the phone app works:
--
--   * A citizen signs in with an email code. No name or number is asked for.
--   * Both are saved only if the citizen fills in their profile in the app,
--     and then they go to the login record (auth.users), not to public.users.
--   * A report is sent with the number from that profile. The backend ties
--     the incident to a public.users row found by that number, which has no
--     name on it.
--
-- So the number is looked for on the incident, then on the public.users row,
-- then on the login record that row points to. The name is looked for on the
-- public.users row, then on that login record, then on the one login record
-- whose saved number matches the report's. If more than one login record has
-- that number, the name is left out: no name is better than someone else's.
--
-- A report from a citizen who never saved a number carries the word "unknown"
-- and is tied to a row shared by everyone who did the same. Nothing can be
-- found for those, and the card says so.
--
-- WHAT IT GIVES AWAY, AND TO WHOM
-- For a report the caller's own service handles, or one not yet matched to a
-- service -- the same test the read policy on reports applies -- it returns
-- the reporter's name and one phone number. For any other report it returns
-- nothing. An admin may ask about any report. Nothing else is returned: not
-- the email address, not the date of birth.
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
-- A value with no usable digits in it is passed over wherever a number is
-- read, so that the word "unknown" on an incident does not hide a real number
-- kept somewhere else. Numbers are compared by their last ten digits, which
-- is the part 0917..., 63917... and +63917... have in common.
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
  WITH picked AS (
    SELECT
      rp.report_id::TEXT AS report_id,
      NULLIF(btrim(u.full_name), '') AS profile_name,
      NULLIF(btrim(COALESCE(la.raw_user_meta_data->>'name', la.raw_user_meta_data->>'full_name')), '') AS login_name,
      COALESCE(
        CASE
          WHEN regexp_replace(COALESCE(i.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
          THEN btrim(i.user_phone_number)
        END,
        CASE
          WHEN regexp_replace(COALESCE(u.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
          THEN btrim(u.user_phone_number)
        END,
        CASE
          WHEN regexp_replace(COALESCE(la.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
          THEN btrim(la.raw_user_meta_data->>'phone')
        END
      ) AS phone
    FROM public.reports rp
    LEFT JOIN public.incidents i ON i.incident_id::TEXT = rp.incident_id::TEXT
    LEFT JOIN public.users u ON u.user_id::TEXT = rp.user_id::TEXT
    LEFT JOIN auth.users la ON la.id::TEXT = u.auth_user_id::TEXT
    WHERE auth.uid() IS NOT NULL
      AND rp.report_id::TEXT = ANY (report_ids)
      AND (
        public.responder_handles_type(rp.classified_as)
        OR public.report_is_unassigned(rp.classified_as)
        OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
      )
  )
  SELECT
    p.report_id,
    COALESCE(
      p.profile_name,
      p.login_name,
      (
        SELECT max(NULLIF(btrim(COALESCE(a.raw_user_meta_data->>'name', a.raw_user_meta_data->>'full_name')), ''))
        FROM auth.users a
        WHERE p.phone IS NOT NULL
          AND right(regexp_replace(COALESCE(a.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g'), 10)
              = right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10)
        HAVING count(*) = 1
      )
    )::TEXT,
    p.phone::TEXT
  FROM picked p;
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
-- What there is to show. The first three columns count reports; the last two
-- count accounts that have filled in a profile in the phone app, which is
-- where a name and a number come from. This runs as the editor's owner, so it
-- counts everything.
SELECT
  (SELECT count(*) FROM public.reports) AS reports,
  (
    SELECT count(*)
    FROM public.reports rp
    LEFT JOIN public.incidents i ON i.incident_id::TEXT = rp.incident_id::TEXT
    LEFT JOIN public.users u ON u.user_id::TEXT = rp.user_id::TEXT
    WHERE regexp_replace(COALESCE(i.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
       OR regexp_replace(COALESCE(u.user_phone_number, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
  ) AS reports_with_a_number,
  (
    SELECT count(*)
    FROM public.incidents i
    WHERE lower(btrim(COALESCE(i.user_phone_number, ''))) = 'unknown'
  ) AS incidents_marked_unknown,
  (
    SELECT count(*) FROM auth.users a
    WHERE NULLIF(btrim(a.raw_user_meta_data->>'name'), '') IS NOT NULL
      AND NOT (a.raw_user_meta_data ? 'role')
  ) AS citizen_accounts_with_a_name,
  (
    SELECT count(*) FROM auth.users a
    WHERE regexp_replace(COALESCE(a.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$'
      AND NOT (a.raw_user_meta_data ? 'role')
  ) AS citizen_accounts_with_a_number;

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
