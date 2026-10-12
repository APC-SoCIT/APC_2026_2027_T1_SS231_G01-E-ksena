-- E-ksena: a dedicated admin account, and what an admin may do to incident videos.
--
-- WHAT THIS DOES
--   1. Makes one named account the administrator, and takes admin away from
--      the account that had it before.
--   2. Lets an admin delete a file in the incident-videos bucket.
--   3. Stops an admin uploading to that bucket, or replacing, renaming or
--      moving a file in it.
--   4. Stops every account that is not an admin deleting from that bucket.
--   5. Lets a deletion be written to the audit log.
--
-- BEFORE RUNNING
--   Create the admin account first:
--     Authentication > Users > Add user > Create new user
--     (type an email and a password, and tick "Auto Confirm User").
--   Then put that email on the line marked CHANGE THIS in PART 1.
--   Until that is done the file stops at PART 1 with an error, having changed
--   nothing.
--
-- Run the whole file in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: who the admin is
-- ---------------------------------------------------------------------------
-- First on purpose. If the new account cannot be found the file stops here,
-- before any rule is touched and before the old admin is removed, so the
-- project is never left with no admin at all.
DO $$
DECLARE
  -- CHANGE THIS to the email address of the new admin account.
  new_admin_email TEXT := 'CHANGE-THIS@example.com';

  -- The account that stops being an admin. It stays a responder.
  old_admin_email TEXT := 'jaycemarkpresbitero1902@gmail.com';

  new_admin_id UUID;
BEGIN
  IF lower(trim(new_admin_email)) = lower(trim(old_admin_email)) THEN
    RAISE EXCEPTION 'The new admin and the old admin are the same account. Nothing was changed.';
  END IF;

  SELECT id INTO new_admin_id
  FROM auth.users
  WHERE lower(email) = lower(trim(new_admin_email));

  IF new_admin_id IS NULL THEN
    RAISE EXCEPTION
      'No account with the email "%" exists. Create it under Authentication > Users, or correct the address in PART 1, then run this file again. Nothing was changed.',
      new_admin_email;
  END IF;

  INSERT INTO public.admins (auth_user_id)
  VALUES (new_admin_id)
  ON CONFLICT (auth_user_id) DO NOTHING;

  DELETE FROM public.admins a
  USING auth.users u
  WHERE u.id = a.auth_user_id
    AND lower(u.email) = lower(trim(old_admin_email));
END $$;

-- ---------------------------------------------------------------------------
-- PART 2: one question the rules below can ask
-- ---------------------------------------------------------------------------
-- The storage rules are checked on every upload from the phone app. Asking
-- through a function, not by reading the admins table directly, means a later
-- change to who may read that table cannot break uploads for everybody.
-- search_path is pinned, as for every definer function in this project.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PART 3: what an admin is allowed
-- ---------------------------------------------------------------------------
-- Deleting through the storage API needs both rules: it reads the file's
-- record before removing it, so a delete rule alone removes nothing and
-- reports no error.
DROP POLICY IF EXISTS "Admins list incident videos" ON storage.objects;
CREATE POLICY "Admins list incident videos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'incident-videos' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete incident videos" ON storage.objects;
CREATE POLICY "Admins delete incident videos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'incident-videos' AND public.is_admin());

-- ---------------------------------------------------------------------------
-- PART 4: limits that hold whatever other rules exist
-- ---------------------------------------------------------------------------
-- These are RESTRICTIVE. An ordinary rule only ever adds permission, so it
-- could not take away an upload that some other rule on this bucket already
-- grants. A restrictive rule is required in addition to the others, which is
-- what makes "an admin cannot upload" true and not merely unstated.
--
-- The phone app is not affected. Each rule passes for every account that is
-- not an admin, and the phone app never deletes, renames or replaces a file.
-- The Supabase dashboard is not affected either: it does not go through
-- these rules.

-- Nobody but an admin deletes an incident video.
DROP POLICY IF EXISTS "Only admins delete incident videos" ON storage.objects;
CREATE POLICY "Only admins delete incident videos" ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO public
  USING (bucket_id IS DISTINCT FROM 'incident-videos' OR public.is_admin());

-- An admin does not add a video.
DROP POLICY IF EXISTS "Admins cannot upload incident videos" ON storage.objects;
CREATE POLICY "Admins cannot upload incident videos" ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (bucket_id IS DISTINCT FROM 'incident-videos' OR NOT public.is_admin());

-- An admin does not replace, rename or move one. USING covers the file as it
-- is; WITH CHECK covers what it would become, so a file cannot be moved into
-- the bucket from somewhere else either.
DROP POLICY IF EXISTS "Admins cannot edit incident videos" ON storage.objects;
CREATE POLICY "Admins cannot edit incident videos" ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO public
  USING (bucket_id IS DISTINCT FROM 'incident-videos' OR NOT public.is_admin())
  WITH CHECK (bucket_id IS DISTINCT FROM 'incident-videos' OR NOT public.is_admin());

-- ---------------------------------------------------------------------------
-- PART 5: let a deletion be written to the audit log
-- ---------------------------------------------------------------------------
-- The log accepted two kinds of entry. A deleted video is a third. Whichever
-- check is there now is found by what it says, not by its name, so this works
-- however the table was first created.
DO $$
DECLARE
  existing RECORD;
BEGIN
  IF to_regclass('public.dispatch_audit_log') IS NULL THEN
    RETURN;
  END IF;

  FOR existing IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.dispatch_audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status_change%'
  LOOP
    EXECUTE format('ALTER TABLE public.dispatch_audit_log DROP CONSTRAINT %I', existing.conname);
  END LOOP;

  ALTER TABLE public.dispatch_audit_log
    ADD CONSTRAINT dispatch_audit_log_action_check
    CHECK (action IN ('status_change', 'reassign', 'video_delete'));
END $$;

-- ---------------------------------------------------------------------------
-- PART 6: check
-- ---------------------------------------------------------------------------
-- Expect one "admin account" row, for the new account and not the old one,
-- and the five rules above among the "video storage rule" rows. Any other
-- storage rule listed was already there before this file.
SELECT 'admin account' AS what,
       u.email::text AS name,
       'admin since ' || to_char(a.added_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI') AS detail
FROM public.admins a
JOIN auth.users u ON u.id = a.auth_user_id
UNION ALL
SELECT 'video storage rule',
       p.policyname::text,
       p.cmd || ' | ' || lower(p.permissive) || ' | ' || array_to_string(p.roles, ', ')
FROM pg_policies p
WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- OPTIONAL TEST: an admin cannot upload
-- ---------------------------------------------------------------------------
-- Run these lines on their own, as one block. They act as the admin account
-- and try to add a file. Expected result:
--   ERROR: new row violates row-level security policy for table "objects"
-- ROLLBACK undoes the attempt either way, so nothing is left behind.
--
-- BEGIN;
-- SELECT set_config(
--   'request.jwt.claims',
--   json_build_object('sub', (SELECT auth_user_id FROM public.admins LIMIT 1), 'role', 'authenticated')::text,
--   true
-- );
-- SET LOCAL ROLE authenticated;
-- INSERT INTO storage.objects (bucket_id, name) VALUES ('incident-videos', 'admin-upload-test.mp4');
-- ROLLBACK;
