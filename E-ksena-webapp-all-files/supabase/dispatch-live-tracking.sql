-- E-ksena: follow a responder on their way to an emergency, live.
--
-- WHY THIS EXISTS
-- When a responder accepts an emergency, the person who reported it should
-- see them coming: where they are now, and when they have arrived. The phone
-- app already listens to the incident's row in public.dispatch, which the
-- backend creates when a report comes in. Nothing on the dashboard ever
-- changed that row, so the app was never told anything.
--
-- This file gives the row what it needs -- the responder's current position
-- and the stage of the trip -- and lets the dashboard move it along:
--
--   dispatched  the backend picked a responder when the report came in
--   en_route    a responder pressed Accept and is on the way
--   arrived     the responder pressed Arrived
--   resolved    the responder pressed Done
--
-- While a trip is en_route or arrived, the dashboard writes the responder's
-- position into current_lat and current_lng as they move. The phone app
-- follows the row through Supabase Realtime and moves the responder on its
-- map. The position lives on the dispatch row, not on the responder's entry
-- in public.responders, because it belongs to one trip to one incident.
--
-- WHO CAN SEE A ROW
-- dispatch has row level security on and, until now, no rules at all: nobody
-- could read it through the API, and Realtime delivered nothing to the app.
-- One rule is added, for the person who reported the incident.
--
-- An incident is tied to the person who reported it only by phone number:
-- the phone app sends the number on the citizen's profile, and the backend
-- stores it on the incident. So that is the test used. It has the weakness
-- every phone-number test here has: a profile number is typed by the citizen
-- and never verified, so someone who types in another person's number could
-- follow that person's responder. The fix is for the backend to record which
-- account sent each report, after which this test can use the account.
--
-- Responders do not read the table directly. The dashboard goes through the
-- three functions in PART 4, which check who is asking.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: what the row holds
-- ---------------------------------------------------------------------------
-- Columns that may already be there are listed too, so the file works on the
-- table however it was first created.
ALTER TABLE public.dispatch
  ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responder_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ DEFAULT now();

-- The stages a trip can be in. Whichever check is there now is found by what
-- it says, not by its name. 'in_progress' stays allowed for anything already
-- written with it. NOT VALID means rows written before this file are left as
-- they are; only new writes are held to the list.
DO $$
DECLARE
  existing RECORD;
BEGIN
  FOR existing IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.dispatch'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%dispatched%'
  LOOP
    EXECUTE format('ALTER TABLE public.dispatch DROP CONSTRAINT %I', existing.conname);
  END LOOP;

  ALTER TABLE public.dispatch
    ADD CONSTRAINT dispatch_status_check
    CHECK (status IN ('dispatched', 'in_progress', 'en_route', 'arrived', 'resolved')) NOT VALID;
END $$;

-- ---------------------------------------------------------------------------
-- PART 2: the person who reported may follow their own dispatch
-- ---------------------------------------------------------------------------
-- A function, so the rule can read the incident and the caller's login
-- record, neither of which the caller may read themselves. Numbers are
-- compared by their last ten digits, the part 0917..., 63917... and
-- +63917... have in common.
CREATE OR REPLACE FUNCTION public.incident_reported_by_me(incident TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.incidents i
    JOIN auth.users me ON me.id = auth.uid()
    LEFT JOIN public.users u ON u.user_id::TEXT = i.user_id::TEXT
    WHERE i.incident_id::TEXT = incident
      AND (
        u.auth_user_id::TEXT = auth.uid()::TEXT
        OR (
          length(regexp_replace(COALESCE(me.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g')) >= 10
          AND right(regexp_replace(COALESCE(i.user_phone_number, ''), '[^0-9]', '', 'g'), 10)
              = right(regexp_replace(COALESCE(me.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g'), 10)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.incident_reported_by_me(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.incident_reported_by_me(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.incident_reported_by_me(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Reporters follow their own dispatch" ON public.dispatch;
CREATE POLICY "Reporters follow their own dispatch" ON public.dispatch
  FOR SELECT TO authenticated
  USING (public.incident_reported_by_me(incident_id::TEXT));

-- ---------------------------------------------------------------------------
-- PART 3: send changes to the phone app as they happen
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispatch'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PART 4: what the dashboard may do to a dispatch row
-- ---------------------------------------------------------------------------
-- Each one works only on incidents the caller's service handles -- the same
-- test the read rule on reports applies -- or on any, for an admin.

-- Accept: the trip is the caller's now, and under way. The backend picked a
-- responder at random when the report came in; whoever accepts replaces
-- them, because they are the one actually going. An incident with no
-- dispatch row yet gets one.
--
-- A trip another responder has already accepted (en_route or arrived) is not
-- taken from them: the caller gets an error instead (TC_W_Dispatch_06). Two
-- accepts of the same incident arriving together are run one after the
-- other by the per-incident lock, so the second always sees the first.
CREATE OR REPLACE FUNCTION public.dispatch_accept(report_ids TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me RECORD;
  target RECORD;
  changed INTEGER;
  total INTEGER := 0;
BEGIN
  SELECT r.responder_id, r.responder_phone_number, r.service_type
  INTO me
  FROM public.responders r
  WHERE r.auth_user_id = auth.uid() AND COALESCE(r.is_active, true)
  LIMIT 1;

  IF me.responder_id IS NULL THEN
    RAISE EXCEPTION 'This account has no active responder record, so it cannot take a dispatch.';
  END IF;

  FOR target IN
    SELECT DISTINCT rp.incident_id::TEXT AS incident_id
    FROM public.reports rp
    WHERE rp.report_id::TEXT = ANY (report_ids)
      AND rp.incident_id IS NOT NULL
      AND (
        public.responder_handles_type(rp.classified_as)
        OR public.report_is_unassigned(rp.classified_as)
        OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
      )
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('dispatch_accept:' || target.incident_id));

    IF EXISTS (
      SELECT 1 FROM public.dispatch d
      WHERE d.incident_id::TEXT = target.incident_id
        AND d.status IN ('en_route', 'arrived')
        AND d.responder_id IS DISTINCT FROM me.responder_id
    ) THEN
      RAISE EXCEPTION 'Another responder has already accepted this emergency and is on the way.';
    END IF;

    UPDATE public.dispatch d
       SET responder_id = me.responder_id,
           responder_phone_number = me.responder_phone_number,
           service_type = me.service_type,
           status = 'en_route',
           dispatched_at = now(),
           arrived_at = NULL,
           completed_at = NULL
     WHERE d.incident_id::TEXT = target.incident_id;
    GET DIAGNOSTICS changed = ROW_COUNT;

    IF changed = 0 THEN
      INSERT INTO public.dispatch
        (incident_id, responder_id, responder_phone_number, service_type, status, assigned_at, dispatched_at)
      VALUES
        (target.incident_id::uuid, me.responder_id, me.responder_phone_number, me.service_type, 'en_route', now(), now());
      changed := 1;
    END IF;

    total := total + changed;
  END LOOP;

  RETURN total;
END;
$$;

-- Where the caller is now, written to every trip of theirs still under way.
-- Called by the dashboard as the responder moves.
CREATE OR REPLACE FUNCTION public.dispatch_report_position(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed INTEGER;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Not a position: %, %', p_lat, p_lng;
  END IF;

  UPDATE public.dispatch d
     SET current_lat = p_lat,
         current_lng = p_lng,
         location_updated_at = now()
   WHERE d.status IN ('en_route', 'arrived')
     AND d.responder_id IN (
       SELECT r.responder_id
       FROM public.responders r
       WHERE r.auth_user_id = auth.uid() AND COALESCE(r.is_active, true)
     );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

-- Arrived and Done. A trip already resolved is left alone. Resolving also
-- fills in arrived_at if Arrived was never pressed: nobody resolves an
-- emergency without getting there.
CREATE OR REPLACE FUNCTION public.dispatch_set_status(report_ids TEXT[], new_status TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF new_status NOT IN ('arrived', 'resolved') THEN
    RAISE EXCEPTION 'A trip can only be marked arrived or resolved here, not %.', new_status;
  END IF;

  UPDATE public.dispatch d
     SET status = new_status,
         arrived_at = CASE WHEN new_status = 'arrived' THEN now() ELSE COALESCE(d.arrived_at, now()) END,
         completed_at = CASE WHEN new_status = 'resolved' THEN now() ELSE d.completed_at END
   WHERE d.status IS DISTINCT FROM 'resolved'
     AND d.incident_id::TEXT IN (
       SELECT rp.incident_id::TEXT
       FROM public.reports rp
       WHERE rp.report_id::TEXT = ANY (report_ids)
         AND rp.incident_id IS NOT NULL
         AND (
           public.responder_handles_type(rp.classified_as)
           OR public.report_is_unassigned(rp.classified_as)
           OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
         )
     );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_accept(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_accept(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispatch_accept(TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.dispatch_report_position(DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_report_position(DOUBLE PRECISION, DOUBLE PRECISION) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispatch_report_position(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

REVOKE ALL ON FUNCTION public.dispatch_set_status(TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_set_status(TEXT[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispatch_set_status(TEXT[], TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 5: check
-- ---------------------------------------------------------------------------
-- Expect: tracking_columns 5, reporter_rule true, live_updates_on true,
-- dashboard_functions 3.
SELECT
  (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispatch'
      AND column_name IN ('current_lat', 'current_lng', 'location_updated_at', 'arrived_at', 'completed_at')
  ) AS tracking_columns,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dispatch'
      AND policyname = 'Reporters follow their own dispatch'
  ) AS reporter_rule,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispatch'
  ) AS live_updates_on,
  (
    SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('dispatch_accept', 'dispatch_report_position', 'dispatch_set_status')
  ) AS dashboard_functions;
