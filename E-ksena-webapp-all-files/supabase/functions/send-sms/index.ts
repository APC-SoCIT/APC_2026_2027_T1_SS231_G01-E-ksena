// Sends one queued SMS through UniSMS (unismsapi.com).
//
// The dashboard cannot do this itself: the UniSMS secret key is a secret, and
// anything a web page holds is public. So the dashboard saves the message to
// sms_messages as 'queued' and calls this function with its id.
//
// Secrets this function needs (Supabase > Edge Functions > Secrets):
//   UNISMS_SECRET_KEY       the API secret key from the UniSMS dashboard
//   UNISMS_VIRTUAL_NUMBER   your UniSMS virtual number, such as +639171234567.
//                           A text sent from it can be replied to, which is
//                           what makes the Messages tab a two-way chat.
//   UNISMS_SENDER_ID        your registered sender ID. Used only when no
//                           virtual number is set. A text sent under a name
//                           cannot be replied to, so the chat is one-way.
//
// Without the key and one of the other two it answers "not_configured" and
// sends nothing, which the dashboard shows as "SMS is not connected yet".
//
// Written from the UniSMS documentation: the address, the Basic sign-in with
// the key as the user name, and the field names. It has not been run against
// a live account, so check the first real message end to end.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SENDER_ID_URL = 'https://unismsapi.com/api/sms';
const VIRTUAL_NUMBER_URL = 'https://unismsapi.com/api/virtual_numbers/sms';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const secretKey = Deno.env.get('UNISMS_SECRET_KEY');
  const virtualNumber = Deno.env.get('UNISMS_VIRTUAL_NUMBER');
  const senderId = Deno.env.get('UNISMS_SENDER_ID');
  if (!secretKey || (!virtualNumber && !senderId)) return reply({ sent: false, reason: 'not_configured' }, 503);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Only a signed-in responder may trigger a send, and only for a message they
  // wrote. Without this, anyone who found the address could spend the SMS
  // balance or resend other people's messages.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller?.user) return reply({ sent: false, reason: 'not_signed_in' }, 401);

  const { message_id } = await req.json().catch(() => ({ message_id: null }));
  if (typeof message_id !== 'string') return reply({ sent: false, reason: 'message_id_required' }, 400);

  // Claim the message before sending, so two calls for the same id cannot
  // both deliver it. Only a row still queued and unclaimed comes back.
  const { data: claimed } = await admin
    .from('sms_messages')
    .update({ provider_message_id: 'sending' })
    .eq('id', message_id)
    .eq('direction', 'outbound')
    .eq('status', 'queued')
    .eq('sender_auth_id', caller.user.id)
    .is('provider_message_id', null)
    .select('id, phone, body')
    .maybeSingle();
  if (!claimed) return reply({ sent: false, reason: 'not_queued' }, 409);

  // From the virtual number when there is one, so the caller can answer.
  const request = virtualNumber
    ? { url: VIRTUAL_NUMBER_URL, body: { from: virtualNumber, to: claimed.phone, content: claimed.body } }
    : {
        url: SENDER_ID_URL,
        body: {
          recipient: claimed.phone,
          content: claimed.body,
          sender_id: senderId,
          metadata: { sms_message_id: claimed.id },
        },
      };

  let ok = false;
  let providerId: string | null = null;
  let failure = '';
  try {
    const res = await fetch(request.url, {
      method: 'POST',
      // UniSMS signs in with the secret key as the user name and no password.
      headers: {
        Authorization: `Basic ${btoa(`${secretKey}:`)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request.body),
    });
    const payload = await res.json().catch(() => null);
    const message = payload?.message ?? payload ?? {};
    ok = res.ok && message.status !== 'failed';
    const reference = message.reference_id ?? payload?.id ?? null;
    providerId = reference ? String(reference) : null;
    if (!ok) {
      failure = asText(message.fail_reason ?? payload?.errors ?? payload?.error ?? `UniSMS answered HTTP ${res.status}`);
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  await admin
    .from('sms_messages')
    .update(
      ok
        ? { status: 'sent', provider_message_id: providerId, error: null }
        : { status: 'failed', provider_message_id: null, error: failure.slice(0, 300) }
    )
    .eq('id', claimed.id);

  return reply({ sent: ok, reason: ok ? null : 'provider_error' }, ok ? 200 : 502);
});
