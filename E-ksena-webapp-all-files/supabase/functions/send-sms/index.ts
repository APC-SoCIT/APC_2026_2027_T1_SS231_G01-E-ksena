// Sends one queued SMS through PhilSMS.
//
// The dashboard cannot do this itself: the PhilSMS token is a secret, and
// anything a web page holds is public. So the dashboard saves the message to
// sms_messages as 'queued' and calls this function with its id.
//
// Secrets this function needs (Supabase > Edge Functions > Secrets):
//   PHILSMS_API_TOKEN   the API token from the PhilSMS dashboard
//   PHILSMS_SENDER_ID   the sender name registered with PhilSMS
//   PHILSMS_API_URL     optional; overrides the endpoint below
//
// Without the first two it answers "not_configured" and sends nothing, which
// the dashboard shows as "SMS is not connected yet".
//
// The request format follows the PhilSMS v3 API as published. It has not been
// run against a live account, so check the first real message end to end.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEFAULT_API_URL = 'https://app.philsms.com/api/v3/sms/send';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const token = Deno.env.get('PHILSMS_API_TOKEN');
  const senderId = Deno.env.get('PHILSMS_SENDER_ID');
  if (!token || !senderId) return reply({ sent: false, reason: 'not_configured' }, 503);

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

  let ok = false;
  let providerId: string | null = null;
  let failure = '';
  try {
    const res = await fetch(Deno.env.get('PHILSMS_API_URL') ?? DEFAULT_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        recipient: claimed.phone.replace(/^\+/, ''),
        sender_id: senderId,
        type: 'plain',
        message: claimed.body,
      }),
    });
    const payload = await res.json().catch(() => null);
    ok = res.ok && payload?.status === 'success';
    providerId = payload?.data?.uid ?? payload?.data?.id ?? null;
    if (!ok) failure = String(payload?.message ?? `PhilSMS answered HTTP ${res.status}`);
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  await admin
    .from('sms_messages')
    .update(
      ok
        ? { status: 'sent', provider_message_id: providerId ? String(providerId) : null, error: null }
        : { status: 'failed', provider_message_id: null, error: failure.slice(0, 300) }
    )
    .eq('id', claimed.id);

  return reply({ sent: ok, reason: ok ? null : 'provider_error' }, ok ? 200 : 502);
});
