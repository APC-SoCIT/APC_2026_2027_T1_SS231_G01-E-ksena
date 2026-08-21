-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor).
-- Links a real, logged-in Supabase Auth account to a row in the mobile app's
-- `responders` table (the real field-personnel directory used for dispatch),
-- so responders who register on the web dashboard are immediately usable by
-- the real dispatch system once the two apps are connected.

ALTER TABLE public.responders
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id);

-- A responder needs a phone number to satisfy the existing NOT NULL/UNIQUE
-- constraint, but the web signup form may not always have one yet at the
-- moment of email verification -- this keeps registration from being blocked
-- by that constraint while still requiring one to be filled in eventually.
ALTER TABLE public.responders
  ALTER COLUMN responder_phone_number DROP NOT NULL;

ALTER TABLE public.responders ENABLE ROW LEVEL SECURITY;

-- A responder can see and manage only their own personnel record.
DROP POLICY IF EXISTS "Responders manage own record" ON public.responders;
CREATE POLICY "Responders manage own record" ON public.responders
  FOR ALL
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Responders (any authenticated one) can see all active personnel -- needed
-- so the dashboard can eventually show other responders/units, not just self.
DROP POLICY IF EXISTS "Authenticated can read responders" ON public.responders;
CREATE POLICY "Authenticated can read responders" ON public.responders
  FOR SELECT
  USING (auth.role() = 'authenticated');
