// Receives a reply from a caller and adds it to their thread.
//
// PhilSMS is given this function's address as its webhook for incoming
// messages. It cannot sign in, so the address carries a secret instead:
//   https://<project>.supabase.co/functions/v1/sms-inbound?key=<SMS_INBOUND_SECRET>
// Deploy it with JWT verification off (see supabase/functions/README.md).
//
// Secret this function needs:
//   SMS_INBOUND_SECRET   any long random string; must match ?key= above
//
// The field names PhilSMS uses for incoming messages are not public, so this
// accepts the common ones. Check the first real reply and narrow the lists
// below to what PhilSMS actually sends.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FROM_FIELDS = ['from', 'sender', 'msisdn', 'phone', 'mobile', 'source'];
const TEXT_FIELDS = ['message', 'body', 'text', 'sms', 'content'];

function pick(fields: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = fields[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

// Threads are keyed by the international form, so 0917..., 63917... and
// +63917... all have to land on the same number.
function toInternational(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  return `+${digits}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('SMS_INBOUND_SECRET');
  const url = new URL(req.url);
  if (!secret || url.searchParams.get('key') !== secret) return new Response('forbidden', { status: 403 });

  let fields: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    fields = { ...fields, ...(await req.json().catch(() => ({}))) };
  } else if (type.includes('form')) {
    fields = { ...fields, ...Object.fromEntries((await req.formData()).entries()) };
  }

  const from = pick(fields, FROM_FIELDS);
  const text = pick(fields, TEXT_FIELDS);
  if (!from || !text) return new Response('missing sender or message', { status: 400 });

  const phone = toInternational(from);
  if (!/^\+[0-9]{8,15}$/.test(phone)) return new Response('unrecognised number', { status: 400 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // The reply belongs to whichever service last wrote to this number. With no
  // earlier message it is left unclaimed, which every service can see.
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
  });
  if (error) return new Response(error.message, { status: 500 });
  return new Response('ok');
});
