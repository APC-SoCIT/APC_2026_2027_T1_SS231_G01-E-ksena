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
-- queues a message here and the backend, which holds the key, sends it.
--
--   Outgoing  The dashboard inserts a row with direction 'outbound' and status
--             'queued'. The backend sends each queued row through the provider
--             (PhilSMS) and sets status to 'sent' with provider_message_id, or
--             to 'failed' with the reason in error.
--   Incoming  When the provider delivers a reply, the backend inserts a row
--             with direction 'inbound' and status 'received', copying
--             service_type from the newest outbound row for that number.
--
-- The backend uses the service-role key, so the policies below do not bind it.
-- Until it does both jobs, messages written on the dashboard stay 'queued' and
-- no text reaches a phone. The dashboard says so on screen.
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

  -- Filled in by the backend.
  provider_message_id TEXT,
  error               TEXT
);

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
-- PART 3: live updates
-- ---------------------------------------------------------------------------
-- Lets an open thread show a reply, or a change of status, as it happens.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sms_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PART 4: check
-- ---------------------------------------------------------------------------
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'sms_messages'
ORDER BY cmd;
-- Expect two rows: INSERT and SELECT. No UPDATE, no DELETE.
