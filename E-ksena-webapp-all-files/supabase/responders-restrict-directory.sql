-- E-ksena: stop every responder reading the whole personnel directory.
--
-- WHY THIS EXISTS
-- supabase/responders-add-auth-link.sql granted this:
--
--   CREATE POLICY "Authenticated can read responders" ON public.responders
--     FOR SELECT USING (auth.role() = 'authenticated');
--
-- Any signed-in account can therefore read every responder row, including
-- responder_phone_number -- the personal mobile number of every member of the
-- service. The comment there said it was so the dashboard could "eventually"
-- show other units. Nothing does. Today only the Admin page reads other
-- people's rows, and only an admin may open it.
--
-- WHAT STILL WORKS AFTER THIS
--   - Sign-in and profile editing. "Responders manage own record" already
--     covers a responder's own row (FOR ALL, auth.uid() = auth_user_id), so
--     upsertResponderRecord and syncResponderRecord are unaffected.
--   - The Admin page. PART 2 gives admins read access to every row.
--
-- WHAT STOPS WORKING
--   Any future screen that lists other responders without an admin check.
--   Grant it deliberately then, rather than leaving the directory open now.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: remove the blanket read
-- ---------------------------------------------------------------------------
ALTER TABLE public.responders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read responders" ON public.responders;

-- ---------------------------------------------------------------------------
-- PART 2: admins keep full read access
-- ---------------------------------------------------------------------------
-- The Admin page lists every account to activate and deactivate them. The
-- matching UPDATE permission is already granted by supabase/admin-access.sql.
DROP POLICY IF EXISTS "Admins read responders" ON public.responders;
CREATE POLICY "Admins read responders" ON public.responders
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid()));

-- A responder's own row stays readable through "Responders manage own record"
-- from responders-add-auth-link.sql. No policy is added for it here, because
-- two overlapping policies on the same command are harder to reason about
-- than one.

-- ---------------------------------------------------------------------------
-- PART 3: check
-- ---------------------------------------------------------------------------
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'responders'
ORDER BY cmd, policyname;
-- Expect: "Admins read responders" (SELECT), "Admins manage responders"
-- (UPDATE), "Responders manage own record" (ALL). No plain authenticated read.

-- Prove it by impersonating a responder who is NOT an admin. The editor runs
-- as an owner role and bypasses RLS, so SET LOCAL ROLE is what makes the
-- policies apply. The transaction is rolled back, so nothing is written.
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"PASTE-AUTH-USER-ID","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT name, responder_phone_number FROM public.responders;
--   ROLLBACK;
--
-- Expect exactly one row -- that responder's own. Run the same block before
-- applying this file and it returns every responder's mobile number.

-- ---------------------------------------------------------------------------
-- PART 4: if the Admin page goes empty
-- ---------------------------------------------------------------------------
-- The signed-in account is not in public.admins. Confirm with:
--
--   SELECT count(*) FROM public.admins WHERE auth_user_id = auth.uid();
--
-- Add it using PART 4 of supabase/admin-access.sql.
