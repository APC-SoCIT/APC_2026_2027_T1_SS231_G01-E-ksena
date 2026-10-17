-- E-ksena: log incident submissions and AI results, and show each dispatch's
-- history with times on the dashboard.
--
-- WHY THIS EXISTS
-- TC_W_Sec_04 expects an incident's submission and its AI result to be
-- written to the audit log. Only the dashboard wrote to it so far, and only
-- for what a responder did, so an incident's life started in the log at the
-- moment someone accepted it. Two triggers now add the earlier steps:
--
--   incident_submitted  a row arrived in public.incidents
--   ai_result           a row arrived in public.ai_analysis
--
-- Neither trigger can stop the row it describes from being saved. If the log
-- entry fails, a warning is raised and the incident goes in regardless: an
-- emergency that reaches no responder because its audit line failed would be
-- far worse than a gap in the log.
--
-- TC_W_Details_03 expects the dispatch details to show each change of status
-- with its time. report_timeline returns, for reports the caller's service
-- handles, when the incident came in, when the AI classified it, and every
-- accept, arrival, cancel, reassignment and Done from the audit log.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.
-- It needs supabase/dispatch-audit-log.sql to have been run first.

-- ---------------------------------------------------------------------------
-- PART 1: the two new kinds of audit entry
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  existing RECORD;
BEGIN
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
    CHECK (action IN (
      'status_change', 'reassign', 'video_delete', 'dispatch_cancel',
      'incident_submitted', 'ai_result'
    ));
END $$;

-- ---------------------------------------------------------------------------
-- PART 2: write them as the rows arrive
-- ---------------------------------------------------------------------------
-- No phone number, name or position goes into the entry: the log is read by
-- admins, and the incident id is enough to find the rest.
CREATE OR REPLACE FUNCTION public.audit_incident_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    INSERT INTO public.dispatch_audit_log
      (actor_auth_id, actor_username, actor_role, action, report_ids, report_count, detail)
    VALUES
      (auth.uid(), 'Citizen app', NULL, 'incident_submitted', '{}', 0,
       jsonb_build_object('incident_id', NEW.incident_id::TEXT));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'E-ksena audit: incident % was saved but not logged: %', NEW.incident_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_incident_submitted ON public.incidents;
CREATE TRIGGER trg_audit_incident_submitted
AFTER INSERT ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.audit_incident_submitted();

-- Triggers on the same table run in name order, so this one runs after
-- trg_ai_analysis_to_reports has made the report, and can list it.
CREATE OR REPLACE FUNCTION public.audit_ai_result()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ids TEXT[];
BEGIN
  BEGIN
    SELECT COALESCE(array_agg(r.report_id::TEXT), '{}')
      INTO ids
      FROM public.reports r
     WHERE r.incident_id::TEXT = NEW.incident_id::TEXT;

    INSERT INTO public.dispatch_audit_log
      (actor_auth_id, actor_username, actor_role, action, new_value, report_ids, report_count, detail)
    VALUES
      (NULL, 'AI classifier', NULL, 'ai_result', NEW.detected_service_type::TEXT, ids, cardinality(ids),
       jsonb_build_object(
         'incident_id', NEW.incident_id::TEXT,
         'confidence', NEW.confidence_score,
         'analysed_at', NEW.analysis_timestamp
       ));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'E-ksena audit: AI result for incident % was saved but not logged: %', NEW.incident_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_ai_analysis ON public.ai_analysis;
CREATE TRIGGER trg_audit_ai_analysis
AFTER INSERT ON public.ai_analysis
FOR EACH ROW
EXECUTE FUNCTION public.audit_ai_result();

-- Only the triggers call these.
REVOKE ALL ON FUNCTION public.audit_incident_submitted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_ai_result() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PART 3: the history of a dispatch, with times
-- ---------------------------------------------------------------------------
-- The submission and the AI result come from their own tables rather than
-- from the log, so incidents from before this file still have them.
DROP FUNCTION IF EXISTS public.report_timeline(TEXT[]);

CREATE FUNCTION public.report_timeline(report_ids TEXT[])
RETURNS TABLE (
  occurred_at TIMESTAMPTZ,
  kind TEXT,
  previous_value TEXT,
  new_value TEXT,
  actor TEXT,
  confidence NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH mine AS (
    SELECT rp.report_id::TEXT AS report_id, rp.incident_id::TEXT AS incident_id, rp."timestamp" AS logged_at
    FROM public.reports rp
    WHERE auth.uid() IS NOT NULL
      AND rp.report_id::TEXT = ANY (report_ids)
      AND (
        public.responder_handles_type(rp.classified_as)
        OR public.report_is_unassigned(rp.classified_as)
        OR EXISTS (SELECT 1 FROM public.admins ad WHERE ad.auth_user_id = auth.uid())
      )
  )
  SELECT i.created_at::TIMESTAMPTZ, 'incident_submitted'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC
  FROM public.incidents i
  WHERE i.incident_id::TEXT IN (SELECT m.incident_id FROM mine m WHERE m.incident_id IS NOT NULL)

  UNION ALL
  -- A report typed in from a phone call or SMS has no incident behind it.
  SELECT m.logged_at::TIMESTAMPTZ, 'report_logged', NULL, NULL, NULL, NULL
  FROM mine m
  WHERE m.incident_id IS NULL

  UNION ALL
  SELECT a.analysis_timestamp::TIMESTAMPTZ, 'ai_result', NULL, a.detected_service_type::TEXT, NULL, a.confidence_score::NUMERIC
  FROM public.ai_analysis a
  WHERE a.incident_id::TEXT IN (SELECT m.incident_id FROM mine m WHERE m.incident_id IS NOT NULL)

  UNION ALL
  SELECT l.occurred_at, l.action, l.previous_value, l.new_value, l.actor_username, NULL
  FROM public.dispatch_audit_log l
  WHERE l.action IN ('status_change', 'reassign', 'dispatch_cancel')
    AND (
      l.report_ids && ARRAY(SELECT m.report_id FROM mine m)
      OR l.detail->>'incident_id' IN (SELECT m.incident_id FROM mine m WHERE m.incident_id IS NOT NULL)
    )

  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.report_timeline(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_timeline(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_timeline(TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 4: check
-- ---------------------------------------------------------------------------
-- Expect triggers 2 and timeline_function 1. new_entries_since_run counts
-- incident and AI entries written since; it stays 0 until a report comes in.
SELECT
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('trg_audit_incident_submitted', 'trg_audit_ai_analysis') AND NOT tgisinternal) AS triggers,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'report_timeline') AS timeline_function,
  (SELECT count(*) FROM public.dispatch_audit_log
    WHERE action IN ('incident_submitted', 'ai_result')) AS new_entries_since_run;
