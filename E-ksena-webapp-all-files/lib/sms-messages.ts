import { supabase } from '@/lib/supabase';
import { SERVICE_TYPE_BY_ROLE } from '@/lib/auth-service';
import type { RoleThemeKey } from '@/constants/theme';

/** Three standard SMS segments. The table refuses anything longer. */
export const SMS_MAX_LENGTH = 480;

export type SmsStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received';

/** A row of public.sms_messages, as far as the dashboard uses it. */
export type SmsMessage = {
  id: string;
  created_at: string;
  /** The caller, in international form. One number is one thread. */
  phone: string;
  direction: 'outbound' | 'inbound';
  body: string;
  status: SmsStatus;
  service_type: string | null;
  sender_name: string | null;
  error: string | null;
};

/** A saved name for a number. A row of public.sms_contacts. */
export type SmsContact = {
  phone: string;
  name: string;
};

/** One entry in the chat list: a number, its saved name and its messages. */
export type SmsChat = {
  phone: string;
  name: string | null;
  messages: SmsMessage[];
  latest: SmsMessage | null;
};

// "Queued" is spelled out because it is the state a responder could mistake
// for sent: the message is saved, and nothing has gone to a phone.
export const SMS_STATUS_LABELS: Record<SmsStatus, string> = {
  queued: 'Queued, not sent yet',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Not sent',
  received: 'Received',
};

const COLUMNS = 'id, created_at, phone, direction, body, status, service_type, sender_name, error';

function explain(message: string): string {
  return /sms_messages/i.test(message) && /find|exist|schema cache/i.test(message)
    ? `${message} Run supabase/sms-messages.sql in the Supabase SQL Editor.`
    : message;
}

export async function fetchSmsMessages(): Promise<SmsMessage[]> {
  const { data, error } = await supabase
    .from('sms_messages')
    .select(COLUMNS)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw new Error(explain(error.message));
  return (data ?? []) as SmsMessage[];
}

export async function fetchSmsContacts(): Promise<SmsContact[]> {
  const { data, error } = await supabase.from('sms_contacts').select('phone, name').order('name');
  if (error) throw new Error(explain(error.message));
  return (data ?? []) as SmsContact[];
}

/** Saves a name for a number, or renames it. One name per number per service. */
export async function saveSmsContact(input: { phone: string; name: string; role: RoleThemeKey }): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('You are signed out. Sign in again to save a contact.');
  const { error } = await supabase.from('sms_contacts').upsert(
    {
      phone: input.phone,
      name: input.name.trim(),
      service_type: SERVICE_TYPE_BY_ROLE[input.role],
      saved_by: auth.user.id,
    },
    { onConflict: 'service_type,phone' }
  );
  if (error) throw new Error(explain(error.message));
}

/**
 * Saves a message as queued and returns its id. It does not send anything:
 * the SMS provider key is a secret and cannot live in a web page, so the
 * dashboard queues and the send-sms function delivers.
 */
export async function queueSmsMessage(input: {
  phone: string;
  body: string;
  role: RoleThemeKey;
  senderName: string;
}): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('You are signed out. Sign in again to send a message.');
  const { data, error } = await supabase
    .from('sms_messages')
    .insert([
      {
        phone: input.phone,
        direction: 'outbound',
        status: 'queued',
        body: input.body,
        service_type: SERVICE_TYPE_BY_ROLE[input.role],
        sender_auth_id: auth.user.id,
        sender_name: input.senderName,
      },
    ])
    .select('id')
    .single();
  if (error) throw new Error(explain(error.message));
  return String(data.id);
}

/**
 * Asks the send-sms function to deliver a queued message. `connected` is false
 * when the function is not deployed or has no PhilSMS token yet, in which case
 * the message simply stays queued. Once the function is live this starts
 * returning true with no change here, which is the whole point of the split.
 */
export async function requestSmsSend(messageId: string): Promise<{ connected: boolean }> {
  try {
    const { error } = await supabase.functions.invoke('send-sms', { body: { message_id: messageId } });
    if (!error) return { connected: true };
    // A reply from PhilSMS that it refused the message still means the link
    // works; the reason is on the message itself. Anything else means there
    // is no working sender behind the function yet.
    const status = (error as { context?: { status?: number } }).context?.status;
    return { connected: status === 502 || status === 409 };
  } catch {
    return { connected: false };
  }
}

/**
 * The text a reporter gets when a responder accepts their report. Kept under
 * 160 characters so it goes out as one SMS, and it repeats the one thing that
 * must not be lost: a text is not a guarantee, so call 911 if in danger.
 */
export const ACCEPTED_SMS =
  'E-ksena: We received your emergency report and a responder is on the way. Stay somewhere safe and keep your phone on. If in immediate danger, call 911.';

export type AcceptanceNotice = {
  /** How many people a text was queued for. One each, however many reports they filed. */
  texted: number;
  /** Reports whose reporter has no usable phone number on record. */
  withoutNumber: number;
  /** False when the account accepting has no active responder record to send as. */
  hasSender: boolean;
  /** Whether the texts were actually handed to the SMS service. Null when there was nothing to send. */
  connected: boolean | null;
};

/**
 * Tells everyone behind a set of reports that a responder is on the way: one
 * text each, sent separately, so nobody learns who else reported. The numbers
 * are looked up in the database, because the dashboard is not allowed to read
 * them, and a reporter already told about a report is not told again.
 */
export async function notifyReportersAccepted(reportIds: string[]): Promise<AcceptanceNotice> {
  const { data, error } = await supabase.rpc('notify_reporters_accepted', {
    report_ids: reportIds,
    message: ACCEPTED_SMS,
  });
  if (error) {
    const missing = /notify_reporters_accepted|schema cache/i.test(error.message);
    throw new Error(
      missing ? `${error.message} Run supabase/sms-messages.sql in the Supabase SQL Editor.` : error.message
    );
  }
  const result = (data ?? {}) as { message_ids?: string[]; without_number?: number; has_sender?: boolean };
  const ids = result.message_ids ?? [];
  const outcomes = await Promise.all(ids.map((id) => requestSmsSend(id)));
  return {
    texted: ids.length,
    withoutNumber: Number(result.without_number ?? 0),
    hasSender: result.has_sender !== false,
    connected: ids.length === 0 ? null : outcomes.every((outcome) => outcome.connected),
  };
}

/**
 * The chat list: every number that has messages or a saved name. Chats with
 * messages come first, most recent on top; saved contacts nobody has written
 * to yet follow, by name.
 */
export function buildSmsChats(messages: SmsMessage[], contacts: SmsContact[]): SmsChat[] {
  const names = new Map(contacts.map((contact) => [contact.phone, contact.name]));
  const byPhone = new Map<string, SmsMessage[]>();
  for (const message of messages) {
    const list = byPhone.get(message.phone);
    if (list) list.push(message);
    else byPhone.set(message.phone, [message]);
  }
  const chats: SmsChat[] = [...byPhone.entries()].map(([phone, list]) => ({
    phone,
    name: names.get(phone) ?? null,
    messages: list,
    latest: list[list.length - 1],
  }));
  chats.sort((a, b) => Date.parse(b.latest!.created_at) - Date.parse(a.latest!.created_at));
  const silent = contacts
    .filter((contact) => !byPhone.has(contact.phone))
    .map((contact) => ({ phone: contact.phone, name: contact.name, messages: [], latest: null }));
  return [...chats, ...silent];
}

const MANILA = 'Asia/Manila';

/** "4:32 PM", in Manila time whatever the browser clock says. */
export function smsClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { timeZone: MANILA, hour: 'numeric', minute: '2-digit' });
}

/** "Oct 12, 2026", used to separate the days in a thread. */
export function smsDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: MANILA, day: 'numeric', month: 'short', year: 'numeric' });
}
