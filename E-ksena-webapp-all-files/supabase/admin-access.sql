-- E-ksena: admin accounts, and permission to manage the responder directory.
--
-- WHY THIS EXISTS
-- supabase/responders-add-auth-link.sql already lets any authenticated account
-- READ the responders table, and lets a responder manage their OWN row. The
-- Admin page also needs to activate and deactivate OTHER people's accounts,
-- which no existing policy allows.
--
-- WHY AN admins TABLE RATHER THAN user_metadata
-- Supabase sign-up metadata is supplied by the client, so anyone registering
-- could claim role = 'admin' for themselves. Membership of this table can only
-- be granted in the Supabase dashboard, and Row Level Security can check it.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: who is an admin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- A signed-in account may check whether it is an admin. No one can write here
-- from the application; membership is granted manually (PART 4).
DROP POLICY IF EXISTS "Authenticated can read admins" ON public.admins;
CREATE POLICY "Authenticated can read admins" ON public.admins
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- PART 2: the column the Admin page switches
-- ---------------------------------------------------------------------------
ALTER TABLE public.responders
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- PART 3: let admins manage any responder record
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage responders" ON public.responders;
CREATE POLICY "Admins manage responders" ON public.responders
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- PART 4: make yourself an admin
-- ---------------------------------------------------------------------------
-- Find the account id under Authentication > Users, then uncomment and run:
--
--   INSERT INTO public.admins (auth_user_id)
--   VALUES ('00000000-0000-0000-0000-000000000000')
--   ON CONFLICT (auth_user_id) DO NOTHING;
--
-- Or, to promote the account with a known email address:
--
--   INSERT INTO public.admins (auth_user_id)
--   SELECT id FROM auth.users WHERE email = 'you@example.com'
--   ON CONFLICT (auth_user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- PART 5: check
-- ---------------------------------------------------------------------------
SELECT (SELECT count(*) FROM public.admins) AS admin_accounts,
       (SELECT count(*) FROM public.responders) AS responder_records;
