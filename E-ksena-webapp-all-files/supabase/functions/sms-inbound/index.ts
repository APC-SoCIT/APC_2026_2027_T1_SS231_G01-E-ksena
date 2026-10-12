// Receives webhooks from UniSMS: replies from callers, and delivery results.
//
// On the Webhooks page of the UniSMS dashboard, put this function's address
//   https://<project>.supabase.co/functions/v1/sms-inbound
// in the "Virtual Numbers: INCOMING" field, so replies arrive here. Putting
// the same address in the SMS status webhook as well lets a text that UniSMS
// could not deliver show as "Not sent" in the thread.
//
// UniSMS cannot sign in, so this is deployed with JWT verification off (see
// supabase/functions/README.md) and UniSMS proves itself another way: every
// call carries a webhook-secret-key header, which must match the secret below.
//
// Secret this function needs:
//   UNISMS_WEBHOOK_SECRET   the Webhook Secret Key shown on that Webhooks page
//
// Written from the UniSMS documentation: the txt.received and message.*
// events and their field names. It has not been run against a live account.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Threads are keyed by the international form, so 0917..., 63917... and
// +63917... all have to land on the same number.
function toInternational(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  return `+${digits}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('UNISMS_WEBHOOK_SECRET');
  if (!secret || req.headers.get('webhook-secret-key') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const event = typeof payload?.event === 'string' ? payload.event : '';
  const message = payload?.message ?? {};
  const reference = typeof payload?.id === 'string' ? payload.id : null;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // A caller replied to the virtual number.
  if (event === 'txt.received') {
    const phone = toInternational(String(message.from ?? ''));
    const text = String(message.content ?? '').trim();
    if (!/^\+[0-9]{8,15}$/.test(phone) || !text) {
      return new Response('missing sender or message', { status: 400 });
    }

    // UniSMS sends a webhook again if it gets no clear answer, so the same
    // reply can arrive twice. It is added to the thread once.
    if (reference) {
      const { data: seen } = await admin
        .from('sms_messages')
        .select('id')
        .eq('direction', 'inbound')
        .eq('provider_message_id', reference)
        .limit(1)
        .maybeSingle();
      if (seen) return new Response('ok');
    }

    // The reply belongs to whichever service last wrote to this number. With
    // no earlier message it is left unclaimed, which every service can see.
    const { data: last } = await admin
      .from('sms_messages')
      .select('service_type')
      .eq('phone', phone)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await admin.from('sms_messages').insert({
      phone,
      direction: 'inbound',
      status: 'received',
      body: text.slice(0, 480),
      service_type: last?.service_type ?? null,
      provider_message_id: reference,
    });
    if (error) return new Response(error.message, { status: 500 });
    return new Response('ok');
  }

  // UniSMS reporting what became of a text sent under a sender ID.
  if (event === 'message.failed' || event === 'message.sent') {
    const sentReference = reference ?? (typeof message.reference_id === 'string' ? message.reference_id : null);
    if (sentReference) {
      await admin
        .from('sms_messages')
        .update(
          event === 'message.failed'
            ? { status: 'failed', error: String(message.fail_reason ?? 'UniSMS could not deliver this message.').slice(0, 300) }
            : { status: 'sent', error: null }
        )
        .eq('direction', 'outbound')
        .eq('provider_message_id', sentReference);
    }
    return new Response('ok');
  }

  // Anything else is acknowledged, so UniSMS does not keep sending it again.
  return new Response('ignored');
});
