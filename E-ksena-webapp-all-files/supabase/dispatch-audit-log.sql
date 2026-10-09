-- E-ksena: an append-only audit trail for dispatch actions.
--
-- WHY THIS EXISTS
-- Iteration 3 finding W-08 (Sec_03, Medium) recorded dispatch events with
-- "minimal detail". In fact the web app writes no audit record at all: what a
-- reviewer could see was only the current state of the reports row
-- (responder_username, status, timestamp), which is overwritten by the next
-- action. There was no history, so "who changed this, from what, and when"
-- could not be answered after the fact.
--
-- WHY A SEPARATE TABLE
-- An audit trail has to survive the thing it describes. Keeping it on reports
-- means each change erases the previous one, and deleting a report erases its
-- history with it.
--
-- WHY APPEND-ONLY
-- There is an INSERT policy and a SELECT policy, and deliberately no UPDATE or
-- DELETE policy. With RLS enabled, an action with no policy is denied, so no
-- application role can rewrite or erase the trail - including the anon key.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: the table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- WHO
  actor_auth_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_username  TEXT,
  actor_role      TEXT,

  -- WHAT
  action          TEXT NOT NULL CHECK (action IN ('status_change', 'reassign')),
  previous_value  TEXT,
  new_value       TEXT,

  -- WHICH
  report_ids      TEXT[] NOT NULL DEFAULT '{}',
  report_count    INTEGER NOT NULL DEFAULT 0,

  -- ANYTHING ELSE worth keeping for this action
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dispatch_audit_occurred_at
  ON public.dispatch_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_audit_actor
  ON public.dispatch_audit_log (actor_auth_id);

-- ---------------------------------------------------------------------------
-- PART 2: append-only access
-- ---------------------------------------------------------------------------
ALTER TABLE public.dispatch_audit_log ENABLE ROW LEVEL SECURITY;

-- A signed-in responder may add entries, and only as themselves: actor_auth_id
-- must match the caller, so an entry cannot be attributed to someone else.
DROP POLICY IF EXISTS "Authenticated append audit entries" ON public.dispatch_audit_log;
CREATE POLICY "Authenticated append audit entries" ON public.dispatch_audit_log
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND actor_auth_id = auth.uid());

-- Admins may read the whole trail; a responder may read their own entries.
DROP POLICY IF EXISTS "Admins read audit log" ON public.dispatch_audit_log;
CREATE POLICY "Admins read audit log" ON public.dispatch_audit_log
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
    OR actor_auth_id = auth.uid()
  );

-- No UPDATE or DELETE policy is defined, on purpose. Under RLS that denies
-- both outright. Do not add one: it would make the trail editable.

-- ---------------------------------------------------------------------------
-- PART 3: check
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.dispatch_audit_log) AS audit_entries,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dispatch_audit_log') AS policies_defined;
