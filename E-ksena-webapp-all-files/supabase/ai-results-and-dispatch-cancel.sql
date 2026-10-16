-- E-ksena: show the AI's confidence on an incident, and let a responder
-- cancel a dispatch they accepted.
--
-- WHY THIS EXISTS
-- TC_W_AI_01 and TC_W_AI_02 expect the dashboard to show the AI's
-- classification with its confidence score, and to flag anything below 85%
-- for a person to verify. The score is in public.ai_analysis, which a
-- responder cannot read, so the card asks report_ai_results instead. It
-- returns only the type and the score, for reports the caller's service
-- handles.
--
-- TC_W_Dispatch_02 expects a responder to be able to cancel a dispatch in
-- progress. dispatch_cancel puts the report back to "matched" so it can be
-- accepted again, and sets the trip back to "dispatched", which tells the
-- reporter's app the responder is no longer on the way.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.
-- It needs supabase/dispatch-live-tracking.sql to have been run first.

-- ---------------------------------------------------------------------------
-- PART 1: the AI result for each report
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.report_ai_results(TEXT[]);

CREATE FUNCTION public.report_ai_results(report_ids TEXT[])
RETURNS TABLE (
  report_id TEXT,
  detected_type TEXT,
  confidence NUMERIC,
  analysed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (rp.report_id)
    rp.report_id::TEXT,
    a.detected_service_type::TEXT,
    a.confidence_score::NUMERIC,
    a.analysis_timestamp
  FROM public.reports rp
  JOIN public.ai_analysis a ON a.incident_id::TEXT = rp.incident_id::TEXT
  WHERE auth.uid() IS NOT NULL
    AND rp.report_id::TEXT = ANY (report_ids)
    AND (
      public.responder_handles_type(rp.classified_as)
      OR public.report_is_unassigned(rp.classified_as)
      OR EXISTS (SELECT 1 FROM public.admins ad WHERE ad.auth_user_id = auth.uid())
    )
  ORDER BY rp.report_id, a.analysis_timestamp DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.report_ai_results(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_ai_results(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_ai_results(TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 2: cancel a dispatch
-- ---------------------------------------------------------------------------
-- Only the responder the trip belongs to, or an admin, may cancel it.
CREATE OR REPLACE FUNCTION public.dispatch_cancel(report_ids TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  my_id UUID;
  is_admin BOOLEAN;
  changed INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  SELECT r.responder_id INTO my_id
  FROM public.responders r
  WHERE r.auth_user_id = auth.uid()
  LIMIT 1;
  is_admin := EXISTS (SELECT 1 FROM public.admins ad WHERE ad.auth_user_id = auth.uid());

  UPDATE public.dispatch d
     SET status = 'dispatched',
         current_lat = NULL,
         current_lng = NULL,
         location_updated_at = NULL,
         arrived_at = NULL
   WHERE d.status IN ('en_route', 'arrived')
     AND (is_admin OR d.responder_id = my_id)
     AND d.incident_id::TEXT IN (
       SELECT rp.incident_id::TEXT FROM public.reports rp
       WHERE rp.report_id::TEXT = ANY (report_ids) AND rp.incident_id IS NOT NULL
     );
  GET DIAGNOSTICS changed = ROW_COUNT;

  UPDATE public.reports rp
     SET status = 'matched',
         responder_username = NULL
   WHERE rp.report_id::TEXT = ANY (report_ids)
     AND rp.status = 'responding'
     AND (
       is_admin
       OR public.responder_handles_type(rp.classified_as)
       OR public.report_is_unassigned(rp.classified_as)
     );

  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_cancel(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_cancel(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispatch_cancel(TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 3: let a cancellation be written to the audit log
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  existing RECORD;
BEGIN
  IF to_regclass('public.dispatch_audit_log') IS NULL THEN
    RETURN;
  END IF;
  FOR existing IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.dispatch_audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status_change%'
  LOOP
    EXECUTE format('ALTER TABLE public.dispatch_audit_log DROP CONSTRAINT %I', existing.conname);
  END LOOP;
  ALTER TABLE public.dispatch_audit_log
    ADD CONSTRAINT dispatch_audit_log_action_check
    CHECK (action IN ('status_change', 'reassign', 'video_delete', 'dispatch_cancel'));
END $$;

-- ---------------------------------------------------------------------------
-- PART 4: check
-- ---------------------------------------------------------------------------
-- Expect functions 2, and analysed_incidents above 0 if reports came from the app.
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('report_ai_results', 'dispatch_cancel')) AS functions,
  (SELECT count(DISTINCT incident_id) FROM public.ai_analysis WHERE confidence_score IS NOT NULL) AS analysed_incidents;
