-- E-ksena: connect AI Analysis to the Reports data store.
--
-- WHY THIS EXISTS
-- Data Flow Diagram Level 2.2 defines the flow:
--     2.2 AI Analysis --"Add Analysis to Report"--> [D] Reports
--     [D] Reports --"View Reports"--> Responder
-- That write was never implemented. As a result ai_analysis fills up while
-- reports stays behind, and every affected emergency is invisible to every
-- responder, because the dashboard reads Reports exactly as the DFD says it
-- should.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent:
-- running it again will not create duplicates.
--
-- PART 1 backfills the emergencies that are already stranded.
-- PART 2 installs a trigger so it cannot happen again.
-- PART 3 reports whether any are still stranded.

-- ---------------------------------------------------------------------------
-- PART 1: backfill the stranded incidents
-- ---------------------------------------------------------------------------
-- One report per incident, using that incident's most recent analysis.
-- Incidents that already have a report are skipped.

INSERT INTO reports (
  incident_id,
  user_id,
  content,
  classified_as,
  report_location_lat,
  report_location_lng,
  timestamp,
  video_path,
  bucket_id,
  is_processed,
  status
)
SELECT
  latest.incident_id,
  i.user_id,
  'Emergency report for incident ' || latest.incident_id::text,
  latest.detected_service_type,
  i.incident_location_lat,
  i.incident_location_lng,
  COALESCE(latest.analysis_timestamp, i.created_at, now()),
  i.video_url,
  'incident-videos',
  false,
  'matched'
FROM (
  SELECT DISTINCT ON (a.incident_id)
    a.incident_id,
    a.detected_service_type,
    a.analysis_timestamp
  FROM ai_analysis a
  WHERE a.incident_id IS NOT NULL
    AND a.detected_service_type IS NOT NULL
  ORDER BY a.incident_id, a.analysis_timestamp DESC NULLS LAST
) AS latest
JOIN incidents i ON i.incident_id = latest.incident_id
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.incident_id = latest.incident_id
);

-- ---------------------------------------------------------------------------
-- PART 2: make the flow automatic from now on
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required: the function reads the incidents table, which
-- Row Level Security hides from the anon role. Running as the function owner
-- lets the trigger read it while application clients still cannot.

CREATE OR REPLACE FUNCTION public.create_report_from_ai_analysis()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inc RECORD;
BEGIN
  IF NEW.incident_id IS NULL OR NEW.detected_service_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM reports r WHERE r.incident_id = NEW.incident_id) THEN
    RETURN NEW;
  END IF;

  SELECT
    i.user_id,
    i.incident_location_lat,
    i.incident_location_lng,
    i.video_url,
    i.created_at
  INTO inc
  FROM incidents i
  WHERE i.incident_id = NEW.incident_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO reports (
    incident_id,
    user_id,
    content,
    classified_as,
    report_location_lat,
    report_location_lng,
    timestamp,
    video_path,
    bucket_id,
    is_processed,
    status
  ) VALUES (
    NEW.incident_id,
    inc.user_id,
    'Emergency report for incident ' || NEW.incident_id::text,
    NEW.detected_service_type,
    inc.incident_location_lat,
    inc.incident_location_lng,
    COALESCE(NEW.analysis_timestamp, inc.created_at, now()),
    inc.video_url,
    'incident-videos',
    false,
    'matched'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_analysis_to_reports ON ai_analysis;

CREATE TRIGGER trg_ai_analysis_to_reports
AFTER INSERT ON ai_analysis
FOR EACH ROW
EXECUTE FUNCTION public.create_report_from_ai_analysis();

-- ---------------------------------------------------------------------------
-- PART 3: check the result
-- ---------------------------------------------------------------------------
-- After running the above, still_stranded should be 0.

SELECT
  (SELECT count(DISTINCT incident_id) FROM ai_analysis WHERE incident_id IS NOT NULL) AS analysed_incidents,
  (SELECT count(*) FROM reports WHERE incident_id IS NOT NULL)                        AS reports_with_incident,
  (SELECT count(*) FROM (
      SELECT DISTINCT a.incident_id
      FROM ai_analysis a
      WHERE a.incident_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.incident_id = a.incident_id)
   ) AS s)                                                                            AS still_stranded;
