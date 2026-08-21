-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- The mobile app's on_auth_user_created trigger (handle_new_user) inserts a
-- row into public.users (the citizen table) for every new auth.users row,
-- assuming every signup is a citizen using the mobile app. Since the web
-- dashboard's responder signup shares the same auth.users table, this
-- trigger was also firing for responders -- causing "Database error saving
-- new user" and, when it succeeds, incorrectly creating a citizen record
-- for someone who isn't a citizen at all.
--
-- Fix: skip the public.users insert when the new auth user has a `role` in
-- their metadata. Only responder signups (this web dashboard) set that --
-- citizen signups from the mobile app never do. Responders already get
-- their own record in public.responders via the web app's own logic.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'role' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (auth_user_id, email, full_name, user_phone_number, date_of_birth, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'user_phone_number', ''),
    NEW.raw_user_meta_data->>'dateOfBirth',
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    email_verified = NEW.email_confirmed_at IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
