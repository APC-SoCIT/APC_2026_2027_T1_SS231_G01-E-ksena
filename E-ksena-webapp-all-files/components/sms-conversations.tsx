import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { PrimaryButton } from '@/components/primary-button';
import { PhoneInput, toE164, isValidPhone } from '@/components/phone-input';
import { formatManilaTime } from '@/lib/assignment-display';
import {
  SMS_MAX_LENGTH,
  SMS_STATUS_LABELS,
  fetchSmsMessages,
  groupSmsThreads,
  queueSmsMessage,
  type SmsMessage,
} from '@/lib/sms-messages';
import {
  Spacing,
  FontSizes,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
  OFF_WHITE,
  BORDER,
  Radius,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
} from '@/constants/theme';

/** Below this width the thread list sits above the thread instead of beside it. */
const SIDE_BY_SIDE_FROM = 820;

function errorText(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
}

/**
 * SMS conversations with callers: a list of threads, one per phone number, and
 * the selected thread with a box to reply.
 *
 * Writing a message here only queues it. The SMS provider key is a secret and
 * cannot be held by a web page, so the backend does the sending and marks each
 * message as it goes. Until the backend is connected to the provider nothing
 * leaves the queue, and the notice at the top says so: a responder who thought
 * a caller had been told help was coming, when no text ever went out, would be
 * worse off than one with no messaging at all.
 */
export function SmsConversations() {
  const { user } = useAuth();
  const theme = useRoleTheme();
  const { width } = useWindowDimensions();
  const sideBySide = width >= SIDE_BY_SIDE_FROM;

  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const threadScroll = useRef<ScrollView | null>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await fetchSmsMessages());
      setLoadError(null);
    } catch (err: unknown) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // A reply, or a queued message being marked sent, shows up without a reload.
    const channel = supabase
      .channel('sms-messages-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_messages' }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const threads = useMemo(() => groupSmsThreads(messages), [messages]);
  // With nothing chosen, the most recent thread is shown rather than a blank pane.
  const activePhone = startingNew ? null : selectedPhone ?? threads[0]?.phone ?? null;
  const activeThread = threads.find((thread) => thread.phone === activePhone) ?? null;
  const composingNew = startingNew || threads.length === 0;

  const handleSend = async () => {
    setSendError(null);
    const body = draft.trim();
    if (composingNew && !isValidPhone(newPhone)) {
      setSendError('Enter the mobile number to message.');
      return;
    }
    const phone = composingNew ? toE164(newPhone) : activePhone;
    if (!phone) {
      setSendError('Choose a conversation, or start a new one.');
      return;
    }
    if (!body) {
      setSendError('Write a message first.');
      return;
    }
    if (!user) {
      setSendError('You are signed out. Sign in again to send a message.');
      return;
    }
    setSending(true);
    try {
      await queueSmsMessage({ phone, body, role: user.role, senderName: user.fullName ?? user.username });
      setDraft('');
      setNewPhone('');
      setStartingNew(false);
      setSelectedPhone(phone);
      await load();
    } catch (err: unknown) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>Conversations</Text>
      <Text style={styles.subtitle}>Text messages between your service and callers, one thread per number.</Text>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          SMS sending is not connected yet. A message you write here is saved as queued and goes out once the SMS
          service is linked to the backend. Until then nothing reaches a phone.
        </Text>
      </View>

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Could not load conversations: {loadError}</Text>
        </View>
      ) : null}

      <View style={[styles.columns, sideBySide && styles.columnsSideBySide]}>
        <View style={[styles.listPane, sideBySide && styles.listPaneSideBySide]}>
          <Pressable
            onPress={() => {
              setStartingNew(true);
              setSendError(null);
            }}
            style={[styles.newBtn, { borderColor: theme.primary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.newBtnText, { color: theme.primary }]}>New conversation</Text>
          </Pressable>

          {loading ? <Text style={styles.muted}>Loading conversations…</Text> : null}
          {!loading && threads.length === 0 && !loadError ? (
            <Text style={styles.muted}>No conversations yet.</Text>
          ) : null}

          {threads.map((thread) => {
            const active = thread.phone === activePhone;
            return (
              <Pressable
                key={thread.phone}
                onPress={() => {
                  setSelectedPhone(thread.phone);
                  setStartingNew(false);
                  setSendError(null);
                }}
                style={[styles.threadRow, active && { borderColor: theme.primary, backgroundColor: OFF_WHITE }]}
                accessibilityRole="button"
              >
                <Text style={styles.threadPhone}>{thread.phone}</Text>
                <Text style={styles.threadPreview} numberOfLines={1}>
                  {thread.latest.direction === 'outbound' ? 'You: ' : ''}
                  {thread.latest.body}
                </Text>
                <Text style={styles.threadTime}>{formatManilaTime(thread.latest.created_at)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.threadPane}>
          <Text style={styles.threadTitle}>{composingNew ? 'New conversation' : activePhone}</Text>

          {composingNew ? (
            <View style={styles.newPhone}>
              <Text style={styles.label}>Mobile number</Text>
              <PhoneInput value={newPhone} onChange={setNewPhone} />
            </View>
          ) : (
            <ScrollView
              ref={threadScroll}
              style={styles.bubbles}
              contentContainerStyle={styles.bubblesContent}
              onContentSizeChange={() => threadScroll.current?.scrollToEnd({ animated: false })}
            >
              {(activeThread?.messages ?? []).map((message) => {
                const outgoing = message.direction === 'outbound';
                return (
                  <View key={message.id} style={[styles.bubbleRow, outgoing && styles.bubbleRowOutgoing]}>
                    <View style={[styles.bubble, outgoing ? { backgroundColor: theme.primary } : styles.bubbleIncoming]}>
                      <Text style={[styles.bubbleText, outgoing && styles.bubbleTextOutgoing]}>{message.body}</Text>
                    </View>
                    <Text style={[styles.bubbleMeta, message.status === 'failed' && styles.bubbleMetaFailed]}>
                      {formatManilaTime(message.created_at)} · {SMS_STATUS_LABELS[message.status] ?? message.status}
                      {outgoing && message.sender_name ? ` · ${message.sender_name}` : ''}
                      {message.status === 'failed' && message.error ? ` · ${message.error}` : ''}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={(text) => setDraft(text.slice(0, SMS_MAX_LENGTH))}
            placeholder="Write a message"
            placeholderTextColor={TEXT_SECONDARY}
            multiline
          />
          <Text style={styles.counter}>
            {draft.length} / {SMS_MAX_LENGTH}
          </Text>

          {sendError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{sendError}</Text>
            </View>
          ) : null}

          <PrimaryButton title={sending ? 'Saving…' : 'Queue message'} onPress={handleSend} disabled={sending} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSizes.subtitle,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.md,
  },
  notice: {
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noticeText: {
    fontSize: FontSizes.sm,
    color: TEXT_PRIMARY,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: DANGER_BG,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: DANGER,
    lineHeight: 20,
  },
  columns: {
    gap: Spacing.lg,
  },
  columnsSideBySide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listPane: {
    gap: Spacing.sm,
  },
  listPaneSideBySide: {
    width: 280,
  },
  newBtn: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: WHITE,
  },
  newBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  muted: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
  },
  threadRow: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    padding: Spacing.md,
    backgroundColor: WHITE,
  },
  threadPhone: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  threadPreview: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  threadTime: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  threadPane: {
    flex: 1,
    minWidth: 0,
  },
  threadTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
  },
  newPhone: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
  },
  bubbles: {
    maxHeight: 380,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    backgroundColor: WHITE,
    marginBottom: Spacing.md,
  },
  bubblesContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  bubbleRow: {
    alignItems: 'flex-start',
  },
  bubbleRowOutgoing: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  bubbleIncoming: {
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  bubbleText: {
    fontSize: FontSizes.sm,
    color: TEXT_PRIMARY,
    lineHeight: 20,
  },
  bubbleTextOutgoing: {
    color: WHITE,
  },
  bubbleMeta: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  bubbleMetaFailed: {
    color: DANGER,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    backgroundColor: WHITE,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    textAlign: 'right',
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
});
