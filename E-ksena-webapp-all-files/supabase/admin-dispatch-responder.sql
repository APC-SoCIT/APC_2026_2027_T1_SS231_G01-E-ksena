-- E-ksena: Admin dispatch functionality.
-- Allows an administrator to explicitly assign a selected responder unit to an emergency report/incident.
--
-- Run this once in your Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: admin_dispatch_responder function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dispatch_responder(
  report_ids TEXT[],
  target_responder_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_unit RECORD;
  target_rep RECORD;
  changed_dispatch INTEGER := 0;
  total_dispatches INTEGER := 0;
  updated_reports INTEGER := 0;
BEGIN
  -- Verify caller is an administrator
  IF NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can dispatch responder units.';
  END IF;

  -- Verify target responder exists and is active
  SELECT r.responder_id, r.name, r.responder_phone_number, r.service_type, COALESCE(r.is_active, true) AS is_active
  INTO target_unit
  FROM public.responders r
  WHERE r.responder_id::TEXT = target_responder_id::TEXT
  LIMIT 1;

  IF target_unit.responder_id IS NULL THEN
    RAISE EXCEPTION 'Target responder unit % does not exist.', target_responder_id;
  END IF;

  IF NOT target_unit.is_active THEN
    RAISE EXCEPTION 'Responder % is inactive and cannot be dispatched.', COALESCE(target_unit.name, target_responder_id);
  END IF;

  -- 1. Update status on matching reports to 'responding' and attribute responder
  UPDATE public.reports
     SET status = 'responding',
         responder_username = COALESCE(target_unit.name, target_responder_id)
   WHERE report_id::TEXT = ANY (report_ids);
  GET DIAGNOSTICS updated_reports = ROW_COUNT;

  -- 2. Create or update public.dispatch entry for each associated incident
  FOR target_rep IN
    SELECT DISTINCT rp.incident_id::TEXT AS incident_id
    FROM public.reports rp
    WHERE rp.report_id::TEXT = ANY (report_ids)
      AND rp.incident_id IS NOT NULL
  LOOP
    UPDATE public.dispatch d
       SET responder_id = target_unit.responder_id,
           responder_phone_number = target_unit.responder_phone_number,
           service_type = target_unit.service_type,
           status = 'en_route',
           dispatched_at = now(),
           arrived_at = NULL,
           completed_at = NULL
     WHERE d.incident_id::TEXT = target_rep.incident_id;
    GET DIAGNOSTICS changed_dispatch = ROW_COUNT;

    IF changed_dispatch = 0 THEN
      INSERT INTO public.dispatch
        (incident_id, responder_id, responder_phone_number, service_type, status, assigned_at, dispatched_at)
      VALUES
        (target_rep.incident_id::uuid, target_unit.responder_id, target_unit.responder_phone_number, target_unit.service_type, 'en_route', now(), now());
    END IF;

    total_dispatches := total_dispatches + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'responder_name', target_unit.name,
    'reports_updated', updated_reports,
    'dispatches_created', total_dispatches
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dispatch_responder(TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_dispatch_responder(TEXT[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_dispatch_responder(TEXT[], TEXT) TO authenticated;
