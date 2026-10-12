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

export type SmsThread = {
  phone: string;
  messages: SmsMessage[];
  latest: SmsMessage;
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

/**
 * Saves a message for the backend to send. It does not send anything itself:
 * the SMS provider key is a secret and cannot live in a web page, so the
 * dashboard queues and the backend delivers.
 */
export async function queueSmsMessage(input: {
  phone: string;
  body: string;
  role: RoleThemeKey;
  senderName: string;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('You are signed out. Sign in again to send a message.');
  const { error } = await supabase.from('sms_messages').insert([
    {
      phone: input.phone,
      direction: 'outbound',
      status: 'queued',
      body: input.body,
      service_type: SERVICE_TYPE_BY_ROLE[input.role],
      sender_auth_id: auth.user.id,
      sender_name: input.senderName,
    },
  ]);
  if (error) throw new Error(explain(error.message));
}

/** One thread per number, the most recently active first. */
export function groupSmsThreads(messages: SmsMessage[]): SmsThread[] {
  const byPhone = new Map<string, SmsMessage[]>();
  for (const message of messages) {
    const list = byPhone.get(message.phone);
    if (list) list.push(message);
    else byPhone.set(message.phone, [message]);
  }
  return [...byPhone.entries()]
    .map(([phone, list]) => ({ phone, messages: list, latest: list[list.length - 1] }))
    .sort((a, b) => Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at));
}
