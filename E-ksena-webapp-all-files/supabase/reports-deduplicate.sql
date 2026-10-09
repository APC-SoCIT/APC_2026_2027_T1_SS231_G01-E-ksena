-- E-ksena: close DEF-003 - one report per incident, enforced by the database.
--
-- WHY THIS EXISTS
-- Measured on the live database on 8 October 2026: 117 reports rows, 90
-- distinct incident_ids, and 8 incidents holding 2 rows each.
--
-- A duplicate matters because the two rows carry different statuses. A
-- responder resolves one; the other stays open, and the emergency reappears
-- on the dashboard as though nobody had handled it.
--
-- ROOT CAUSE NOT ESTABLISHED
-- An earlier draft of this file blamed the mobile backend for writing a
-- second row. That was checked on 8 October 2026 and is wrong: the backend
-- never writes to reports. Only create_report_from_ai_analysis does.
--
-- What is known is that the trigger guards itself with
--
--   IF EXISTS (SELECT 1 FROM reports WHERE incident_id = NEW.incident_id) ...
--
-- and check-then-insert is not atomic, so two ai_analysis rows for the same
-- incident arriving close together would produce two reports rows. That is a
-- candidate, not a finding. Do not record a cause in the defect log that has
-- not been demonstrated.
--
-- WHY A CONSTRAINT ANYWAY
-- A unique index does not depend on knowing the cause: whatever attempts the
-- second write, Postgres cannot store it. The trade-off is that the attempt
-- now fails quietly rather than leaving evidence behind. If the cause still
-- matters diagnostically, add logging - do not rely on this alone to find it.
--
-- ---------------------------------------------------------------------------
-- RUN PART 1 ON ITS OWN FIRST AND READ THE RESULT.
-- PART 2 DELETES ROWS. Everything after it depends on PART 2 having run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- PART 1: dry run - what is duplicated, and what PART 2 would remove
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    report_id,
    incident_id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY incident_id
      ORDER BY
        CASE status
          WHEN 'resolved'   THEN 1
          WHEN 'responding' THEN 2
          WHEN 'matched'    THEN 3
          WHEN 'pending'    THEN 4
          ELSE 5
        END,
        report_id
    ) AS rn
  FROM public.reports
  WHERE incident_id IS NOT NULL
)
SELECT
  incident_id,
  report_id,
  status,
  CASE WHEN rn = 1 THEN 'KEEP' ELSE 'DELETE' END AS action
FROM ranked
WHERE incident_id IN (
  SELECT incident_id FROM public.reports
  WHERE incident_id IS NOT NULL
  GROUP BY incident_id HAVING count(*) > 1
)
ORDER BY incident_id, rn;

-- The row kept per incident is the one furthest through the workflow, so a
-- responder's work is never the row that gets discarded. Ties go to the
-- lowest report_id, which is the one created first.

-- ---------------------------------------------------------------------------
-- PART 2: remove the surplus rows  *** DELETES DATA ***
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    report_id,
    ROW_NUMBER() OVER (
      PARTITION BY incident_id
      ORDER BY
        CASE status
          WHEN 'resolved'   THEN 1
          WHEN 'responding' THEN 2
          WHEN 'matched'    THEN 3
          WHEN 'pending'    THEN 4
          ELSE 5
        END,
        report_id
    ) AS rn
  FROM public.reports
  WHERE incident_id IS NOT NULL
)
DELETE FROM public.reports r
USING ranked
WHERE r.report_id = ranked.report_id
  AND ranked.rn > 1;

-- ---------------------------------------------------------------------------
-- PART 3: stop it happening again
-- ---------------------------------------------------------------------------
-- Partial, so the rows with no incident_id are unaffected. There are 19 of
-- those; they are a separate question, not a duplicate problem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_incident_id
  ON public.reports (incident_id)
  WHERE incident_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PART 4: let the trigger lose the race safely
-- ---------------------------------------------------------------------------
-- With PART 3 in place the loser of a race would raise a unique violation and
-- fail the whole transaction. ON CONFLICT DO NOTHING makes losing harmless.
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
  )
  ON CONFLICT (incident_id) WHERE incident_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- PART 5: check
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.reports) AS reports_rows,
  (SELECT count(DISTINCT incident_id) FROM public.reports
     WHERE incident_id IS NOT NULL) AS distinct_incidents,
  (SELECT count(*) FROM (
     SELECT incident_id FROM public.reports
     WHERE incident_id IS NOT NULL
     GROUP BY incident_id HAVING count(*) > 1) d) AS incidents_with_duplicates;
-- incidents_with_duplicates must be 0.
