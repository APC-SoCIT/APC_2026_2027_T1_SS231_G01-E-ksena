-- E-ksena: SMS conversations between responders and callers.
--
-- WHY THIS EXISTS
-- The Messages tab is meant to work like a messenger carried by SMS: a
-- responder writes to a caller from the dashboard, the caller answers from
-- their phone, and both sides appear as one thread. The existing messages
-- table is an outbox -- a number and a text -- and cannot hold that: nothing in
-- it says which way a message went, who wrote it or which service it concerns.
-- This table can. The older one is left alone for whatever still writes to it.
--
-- HOW A MESSAGE TRAVELS
-- The dashboard never talks to the SMS provider. The provider's key is a
-- secret, and anything the dashboard holds is public, so the dashboard only
-- queues a message here. Two Supabase functions, which can hold the key, do
-- the rest. Both are in supabase/functions and need no dashboard change:
--
--   Outgoing  The dashboard inserts a row with direction 'outbound' and status
--             'queued', then asks the send-sms function to deliver it. The
--             function sends it through PhilSMS and sets status to 'sent' with
--             provider_message_id, or to 'failed' with the reason in error.
--   Incoming  PhilSMS calls the sms-inbound function with each reply, and it
--             inserts a row with direction 'inbound' and status 'received',
--             copying service_type from the newest outbound row to that number.
--
-- The functions use the service-role key, so the policies below do not bind
-- them. Until they are deployed and given a PhilSMS token, a message written
-- on the dashboard stays 'queued' and no text reaches a phone. The dashboard
-- says so on screen. supabase/functions/README.md has the steps.
--
-- WHO SEES A THREAD
-- A caller's number and what they wrote are personal data, so a thread is
-- shown to the service that is talking to them and to admins, not to every
-- responder. A row with no service_type has not been claimed by any service
-- and is shown to all of them, so that an unexpected text is not lost.
--
-- Run this whole file once in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- PART 1: the table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The caller's number in international form, +639171234567. One number is
  -- one thread.
  phone               TEXT NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  direction           TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  -- 480 characters is three standard SMS segments.
  body                TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 480),
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),

  -- Which service the thread belongs to: fire, medical or police.
  service_type        TEXT CHECK (service_type IN ('fire', 'medical', 'police')),
  -- The report the conversation is about, when there is one.
  report_id           TEXT,

  -- Who wrote an outgoing message.
  sender_auth_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name         TEXT,

  -- Filled in by the sending function.
  provider_message_id TEXT,
  error               TEXT,

  -- 'chat' is something a responder typed. 'accepted' is the automatic text
  -- that tells a reporter their report was taken up.
  kind                TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'accepted'))
);

-- For a table created before kind existed.
ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'accepted'));

-- A reporter is told once per report that help is coming, however many times
-- Accept is pressed. The database refuses a second copy.
CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_accepted_once
  ON public.sms_messages (report_id, phone) WHERE kind = 'accepted';

CREATE INDEX IF NOT EXISTS sms_messages_thread_idx ON public.sms_messages (phone, created_at);
CREATE INDEX IF NOT EXISTS sms_messages_queue_idx ON public.sms_messages (status) WHERE status = 'queued';

-- ---------------------------------------------------------------------------
-- PART 2: who may read and write
-- ---------------------------------------------------------------------------
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responders read their service threads" ON public.sms_messages;
CREATE POLICY "Responders read their service threads" ON public.sms_messages
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.responders r
      WHERE r.auth_user_id = auth.uid()
        AND COALESCE(r.is_active, true)
        AND (sms_messages.service_type IS NULL OR r.service_type = sms_messages.service_type)
    )
  );

-- A responder may only queue an outgoing message, in their own name and for
-- their own service. Marking a message sent, or adding an incoming one, is the
-- backend's job: a client that could do either could fake a conversation.
DROP POLICY IF EXISTS "Responders queue outgoing messages" ON public.sms_messages;
CREATE POLICY "Responders queue outgoing messages" ON public.sms_messages
  FOR INSERT
  WITH CHECK (
    direction = 'outbound'
    AND status = 'queued'
    AND kind = 'chat'
    AND sender_auth_id = auth.uid()
    AND provider_message_id IS NULL
    AND error IS NULL
    AND EXISTS (
      SELECT 1 FROM public.responders r
      WHERE r.auth_user_id = auth.uid()
        AND COALESCE(r.is_active, true)
        AND r.service_type = sms_messages.service_type
    )
  );

-- No UPDATE and no DELETE policy, on purpose: under row level security that
-- denies both to every signed-in account, so a thread cannot be edited after
-- the fact or removed from the dashboard.

-- ---------------------------------------------------------------------------
-- PART 3: saved contacts
-- ---------------------------------------------------------------------------
-- A name for a number, so a thread reads as a person and not as digits. Kept
-- per service: the same caller may be known to two services, and neither
-- should see what the other has noted.
CREATE TABLE IF NOT EXISTS public.sms_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  phone        TEXT NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  service_type TEXT NOT NULL CHECK (service_type IN ('fire', 'medical', 'police')),
  saved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (service_type, phone)
);

ALTER TABLE public.sms_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responders read their service contacts" ON public.sms_contacts;
CREATE POLICY "Responders read their service contacts" ON public.sms_contacts
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.responders r
      WHERE r.auth_user_id = auth.uid()
        AND COALESCE(r.is_active, true)
        AND r.service_type = sms_contacts.service_type
    )
  );

DROP POLICY IF EXISTS "Responders save their service contacts" ON public.sms_contacts;
CREATE POLICY "Responders save their service contacts" ON public.sms_contacts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.responders r
      WHERE r.auth_user_id = auth.uid()
        AND COALESCE(r.is_active, true)
        AND r.service_type = sms_contacts.service_type
    )
  );

-- Renaming a contact. The same test before and after, so a contact cannot be
-- moved into another service by editing it.
DROP POLICY IF EXISTS "Responders rename their service contacts" ON public.sms_contacts;
CREATE POLICY "Responders rename their service contacts" ON public.sms_contacts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.responders r
      WHERE r.auth_user_id = auth.uid()
        AND COALESCE(r.is_active, true)
        AND r.service_type = sms_contacts.service_type
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.responders r
      WHERE r.auth_user_id = auth.uid()
        AND COALESCE(r.is_active, true)
        AND r.service_type = sms_contacts.service_type
    )
  );

-- ---------------------------------------------------------------------------
-- PART 4: live updates
-- ---------------------------------------------------------------------------
-- Lets an open thread show a reply, a change of status or a renamed contact
-- as it happens.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_messages', 'sms_contacts'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PART 5: tell every reporter their report was accepted
-- ---------------------------------------------------------------------------
-- When several people report the same emergency the dashboard shows one card,
-- and one Accept answers all of them. Each of those people is then sent their
-- own text. It is not a group message: nobody learns who else reported.
--
-- The reporter's number is on the incident their report came from, with their
-- profile as a fallback. Responders cannot read either table, so the lookup is
-- done here, for reports the caller's own service handles and no others.
-- Numbers are put into international form, and a person who filed several of
-- the reports is texted once.
CREATE OR REPLACE FUNCTION public.notify_reporters_accepted(report_ids TEXT[], message TEXT)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT r.service_type, COALESCE(NULLIF(btrim(r.name), ''), 'Responder') AS sender_name
    FROM public.responders r
    WHERE r.auth_user_id = auth.uid() AND COALESCE(r.is_active, true)
    LIMIT 1
  ),
  mine AS (
    SELECT rp.report_id::TEXT AS report_id,
           regexp_replace(
             COALESCE(NULLIF(btrim(i.user_phone_number), ''), NULLIF(btrim(u.user_phone_number), ''), ''),
             '[^0-9]', '', 'g'
           ) AS digits
    FROM public.reports rp
    LEFT JOIN public.incidents i ON i.incident_id::TEXT = rp.incident_id::TEXT
    LEFT JOIN public.users u ON u.user_id::TEXT = rp.user_id::TEXT
    WHERE rp.report_id::TEXT = ANY (report_ids)
      AND (
        public.responder_handles_type(rp.classified_as)
        OR public.report_is_unassigned(rp.classified_as)
        OR EXISTS (SELECT 1 FROM public.admins a WHERE a.auth_user_id = auth.uid())
      )
  ),
  numbered AS (
    SELECT report_id,
           CASE
             WHEN digits ~ '^0[0-9]{9,11}$'  THEN '+63' || substr(digits, 2)
             WHEN digits ~ '^63[0-9]{9,11}$' THEN '+' || digits
             WHEN digits ~ '^9[0-9]{9}$'     THEN '+63' || digits
             WHEN digits ~ '^[0-9]{8,15}$'   THEN '+' || digits
             ELSE NULL
           END AS phone
    FROM mine
  ),
  recipients AS (
    SELECT DISTINCT ON (phone) phone, report_id
    FROM numbered
    WHERE phone IS NOT NULL
    ORDER BY phone, report_id
  ),
  queued AS (
    INSERT INTO public.sms_messages
      (phone, direction, status, body, service_type, report_id, sender_auth_id, sender_name, kind)
    SELECT rc.phone, 'outbound', 'queued', left(btrim(message), 480), me.service_type,
           rc.report_id, auth.uid(), me.sender_name, 'accepted'
    FROM recipients rc
    CROSS JOIN me
    WHERE auth.uid() IS NOT NULL AND char_length(btrim(message)) > 0
    ON CONFLICT (report_id, phone) WHERE kind = 'accepted' DO NOTHING
    RETURNING id
  )
  SELECT jsonb_build_object(
    'message_ids', COALESCE((SELECT jsonb_agg(id) FROM queued), '[]'::jsonb),
    'reports', (SELECT count(*) FROM mine),
    'without_number', (SELECT count(*) FROM numbered WHERE phone IS NULL),
    'has_sender', EXISTS (SELECT 1 FROM me)
  );
$$;

REVOKE ALL ON FUNCTION public.notify_reporters_accepted(TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_reporters_accepted(TEXT[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_reporters_accepted(TEXT[], TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- PART 6: check
-- ---------------------------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('sms_messages', 'sms_contacts')
ORDER BY tablename, cmd;
-- Expect five rows: sms_contacts with INSERT, SELECT and UPDATE; sms_messages
-- with INSERT and SELECT. No DELETE on either.
