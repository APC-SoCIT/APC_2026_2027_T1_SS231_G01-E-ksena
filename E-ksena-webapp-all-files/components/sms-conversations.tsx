import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import {
  SMS_MAX_LENGTH,
  SMS_STATUS_LABELS,
  buildSmsChats,
  fetchSmsContacts,
  fetchSmsMessages,
  queueSmsMessage,
  requestSmsSend,
  wakeSmsBackend,
  saveSmsContact,
  smsClock,
  smsDay,
  type SmsContact,
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

/** From this width the chat list and the open chat sit side by side. */
const WIDE_FROM = 820;
/** A message still queued after this long means nothing is sending. */
const STALE_QUEUE_MS = 60000;

function errorText(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
}

function initial(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '#';
}

/**
 * The Messages tab: a messenger for texting callers. Chats on the left, one
 * per number, with saved names; the open chat on the right.
 *
 * A chat cannot be started here. One begins when a responder accepts an
 * emergency on the Map: each reporter is texted that help is on the way, and
 * that text is the first message of their chat. This screen is where the
 * conversation then carries on, so there is nowhere to type a number.
 *
 * Sending is split in two on purpose. This screen saves the message and asks
 * the team's backend to deliver it, because the SMS provider key is a secret
 * and a web page cannot hold one. If the backend cannot be reached the message
 * stays queued and the screen says SMS is not connected. A responder who
 * believed a caller had been told help was coming, when no text ever went out,
 * would be worse off than one with no messaging at all, so that state is never
 * hidden.
 */
export function SmsMessenger() {
  const { user } = useAuth();
  const theme = useRoleTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_FROM;

  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queueStuck, setQueueStuck] = useState(false);
  const [senderOffline, setSenderOffline] = useState(false);

  const [search, setSearch] = useState('');
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextMessages, nextContacts] = await Promise.all([fetchSmsMessages(), fetchSmsContacts()]);
      setMessages(nextMessages);
      setContacts(nextContacts);
      setQueueStuck(
        nextMessages.some(
          (m) => m.direction === 'outbound' && m.status === 'queued' && Date.now() - Date.parse(m.created_at) > STALE_QUEUE_MS
        )
      );
      setLoadError(null);
    } catch (err: unknown) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    wakeSmsBackend();
  }, []);

  useEffect(() => {
    load();
    // A reply, a message being marked sent or a renamed contact shows up without a reload.
    const channel = supabase
      .channel('sms-messenger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_messages' }, () => {
        load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_contacts' }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const chats = useMemo(() => buildSmsChats(messages, contacts), [messages, contacts]);
  const shownChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return chats;
    return chats.filter(
      (chat) =>
        chat.phone.includes(query) ||
        (chat.name ?? '').toLowerCase().includes(query) ||
        (chat.latest?.body ?? '').toLowerCase().includes(query)
    );
  }, [chats, search]);

  // On a wide screen the newest chat is open by default, as in any messenger.
  // On a narrow one the list is the first thing shown, and a chat replaces it.
  const openPhone = activePhone ?? (wide ? chats[0]?.phone ?? null : null);
  const openChat = chats.find((chat) => chat.phone === openPhone) ?? null;
  const showList = wide || !openChat;
  const showThread = wide || !!openChat;
  const notConnected = senderOffline || queueStuck;

  const openChatFor = (phone: string) => {
    setActivePhone(phone);
    setNameDraft(null);
    setSendError(null);
  };

  const send = async () => {
    setSendError(null);
    const body = draft.trim();
    const phone = openChat?.phone;
    if (!phone) {
      setSendError('Choose a chat first.');
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
      const id = await queueSmsMessage({ phone, body, role: user.role, senderName: user.fullName ?? user.username });
      setDraft('');
      setActivePhone(phone);
      await load();
      // Saved first, delivered second, and the delivery is not waited for.
      // The backend can take most of a minute to answer after a quiet spell,
      // and the next message should not have to queue up behind this one.
      requestSmsSend(id).then(({ connected }) => {
        setSenderOffline(!connected);
        load();
      });
    } catch (err: unknown) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const saveName = async () => {
    if (!openPhone || !user || nameDraft === null) return;
    if (!nameDraft.trim()) {
      setSendError('Enter a name for this number.');
      return;
    }
    try {
      await saveSmsContact({ phone: openPhone, name: nameDraft, role: user.role });
      setNameDraft(null);
      setSendError(null);
      await load();
    } catch (err: unknown) {
      setSendError(errorText(err));
    }
  };

  const onKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== 'web' || event.nativeEvent.key !== 'Enter') return;
    if ((event.nativeEvent as { shiftKey?: boolean }).shiftKey) return;
    event.preventDefault();
    send();
  };

  const sidebar = (
    <View style={[styles.sidebar, wide && styles.sidebarWide]}>
      <View style={styles.sidebarHead}>
        <Text style={styles.sidebarTitle}>Chats</Text>
      </View>
      <TextInput
        style={[styles.field, styles.search]}
        value={search}
        onChangeText={setSearch}
        placeholder="Search name or number"
        placeholderTextColor={TEXT_SECONDARY}
      />
      <ScrollView style={styles.chatList}>
        {loading ? <Text style={styles.muted}>Loading…</Text> : null}
        {!loading && shownChats.length === 0 ? (
          <Text style={styles.muted}>
            {chats.length === 0
              ? 'No chats yet. One starts when you accept an emergency on the Map: the reporter is texted, and the chat appears here.'
              : 'Nothing matches that search.'}
          </Text>
        ) : null}
        {shownChats.map((chat) => (
          <Pressable
            key={chat.phone}
            onPress={() => openChatFor(chat.phone)}
            style={[styles.chatRow, chat.phone === openPhone && styles.chatRowActive]}
            accessibilityRole="button"
          >
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{initial(chat.name)}</Text>
            </View>
            <View style={styles.chatRowBody}>
              <View style={styles.chatRowTop}>
                <Text style={styles.chatName} numberOfLines={1}>
                  {chat.name ?? chat.phone}
                </Text>
                {chat.latest ? <Text style={styles.chatTime}>{smsClock(chat.latest.created_at)}</Text> : null}
              </View>
              <Text style={styles.chatPreview} numberOfLines={1}>
                {chat.latest
                  ? `${chat.latest.direction === 'outbound' ? 'You: ' : ''}${chat.latest.body}`
                  : 'No messages yet'}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const thread = (
    <View style={styles.thread}>
      <View style={styles.threadHead}>
        {!wide ? (
          <Pressable onPress={() => setActivePhone(null)} hitSlop={8}>
            <Text style={[styles.linkText, { color: theme.primary }]}>Back</Text>
          </Pressable>
        ) : null}
        {openChat ? (
          <>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{initial(openChat.name)}</Text>
            </View>
            <View style={styles.threadWho}>
              <Text style={styles.threadName} numberOfLines={1}>
                {openChat.name ?? openChat.phone}
              </Text>
              {openChat.name ? <Text style={styles.threadNumber}>{openChat.phone}</Text> : null}
            </View>
            <Pressable onPress={() => setNameDraft(openChat.name ?? '')} hitSlop={8}>
              <Text style={[styles.linkText, { color: theme.primary }]}>
                {openChat.name ? 'Rename' : 'Save contact'}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.threadName}>Messages</Text>
        )}
      </View>

      {nameDraft !== null && openChat ? (
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.field, styles.nameInput]}
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder="Name for this number"
            placeholderTextColor={TEXT_SECONDARY}
          />
          <Pressable onPress={saveName} style={[styles.smallBtn, { backgroundColor: theme.primary }]}>
            <Text style={styles.smallBtnText}>Save</Text>
          </Pressable>
          <Pressable onPress={() => setNameDraft(null)} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {notConnected ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            SMS is not connected yet. Messages are saved as queued and go out once the SMS service is linked.
            Nothing reaches a phone until then.
          </Text>
        </View>
      ) : null}

      {openChat ? (
        <ScrollView
          ref={scrollRef}
          style={styles.bubbles}
          contentContainerStyle={styles.bubblesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {openChat.messages.length === 0 ? <Text style={styles.muted}>No messages yet. Write one below.</Text> : null}
          {openChat.messages.map((message, index) => {
            const outgoing = message.direction === 'outbound';
            const day = smsDay(message.created_at);
            const newDay = index === 0 || smsDay(openChat.messages[index - 1].created_at) !== day;
            return (
              <View key={message.id}>
                {newDay ? <Text style={styles.dayMark}>{day}</Text> : null}
                <View style={[styles.bubbleRow, outgoing && styles.bubbleRowOut]}>
                  <View style={[styles.bubble, outgoing ? { backgroundColor: theme.primary } : styles.bubbleIn]}>
                    <Text style={[styles.bubbleText, outgoing && styles.bubbleTextOut]}>{message.body}</Text>
                  </View>
                  <Text style={[styles.bubbleMeta, message.status === 'failed' && styles.bubbleMetaFailed]}>
                    {smsClock(message.created_at)}
                    {outgoing ? ` · ${SMS_STATUS_LABELS[message.status] ?? message.status}` : ''}
                    {message.status === 'failed' && message.error
                      ? ` · ${/HTTP \d{3}/i.test(message.error) ? 'SMS provider declined' : message.error}`
                      : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.muted}>
            {chats.length === 0
              ? 'A chat starts when an emergency is accepted on the Map.'
              : 'Choose a chat.'}
          </Text>
        </View>
      )}

      {openChat ? (
        <View style={styles.composer}>
          {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
          <View style={styles.composerRow}>
            <TextInput
              style={[styles.field, styles.composerInput]}
              value={draft}
              onChangeText={(text) => setDraft(text.slice(0, SMS_MAX_LENGTH))}
              onKeyPress={onKeyPress}
              placeholder="Write a message"
              placeholderTextColor={TEXT_SECONDARY}
              multiline
            />
            <Pressable
              onPress={send}
              disabled={sending}
              style={[styles.sendBtn, { backgroundColor: theme.primary }, sending && styles.sendBtnBusy]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Text style={styles.smallBtnText}>{sending ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </View>
          <Text style={styles.counter}>
            {draft.length} / {SMS_MAX_LENGTH}
            {Platform.OS === 'web' ? ' · Enter to send, Shift+Enter for a new line' : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Could not load messages: {loadError}</Text>
        </View>
      ) : null}
      <View style={styles.messenger}>
        {showList ? sidebar : null}
        {showThread ? thread : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: Spacing.lg, backgroundColor: OFF_WHITE },
  messenger: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 420,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  errorBox: {
    backgroundColor: DANGER_BG,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { fontSize: FontSizes.sm, color: DANGER, lineHeight: 20 },
  muted: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, padding: Spacing.md },
  field: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.sm,
    color: TEXT_PRIMARY,
    backgroundColor: WHITE,
  },
  smallBtn: { borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  smallBtnText: { fontSize: FontSizes.sm, fontWeight: '600', color: WHITE },
  linkText: { fontSize: FontSizes.sm, fontWeight: '600' },
  cancelText: { fontSize: FontSizes.sm, color: TEXT_SECONDARY },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: WHITE, fontSize: FontSizes.sm, fontWeight: '700' },

  sidebar: { flex: 1, minWidth: 0 },
  sidebarWide: { flexGrow: 0, flexShrink: 0, flexBasis: 320, borderRightWidth: 1, borderRightColor: BORDER },
  sidebarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  sidebarTitle: { fontSize: FontSizes.subtitle, fontWeight: '700', color: TEXT_PRIMARY },
  search: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  chatList: { flex: 1 },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  chatRowActive: { backgroundColor: OFF_WHITE },
  chatRowBody: { flex: 1, minWidth: 0 },
  chatRowTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  chatName: { flex: 1, fontSize: FontSizes.sm, fontWeight: '700', color: TEXT_PRIMARY },
  chatTime: { fontSize: FontSizes.xs, color: TEXT_SECONDARY },
  chatPreview: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, marginTop: 2 },

  thread: { flex: 1, minWidth: 0 },
  threadHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    minHeight: 60,
  },
  threadWho: { flex: 1, minWidth: 0 },
  threadName: { flex: 1, fontSize: FontSizes.body, fontWeight: '700', color: TEXT_PRIMARY },
  threadNumber: { fontSize: FontSizes.xs, color: TEXT_SECONDARY },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  nameInput: { flex: 1 },
  notice: { backgroundColor: OFF_WHITE, borderBottomWidth: 1, borderBottomColor: BORDER, padding: Spacing.md },
  noticeText: { fontSize: FontSizes.xs, color: TEXT_PRIMARY, lineHeight: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bubbles: { flex: 1, backgroundColor: OFF_WHITE },
  bubblesContent: { padding: Spacing.md, gap: Spacing.sm },
  dayMark: { alignSelf: 'center', fontSize: FontSizes.xs, color: TEXT_SECONDARY, marginVertical: Spacing.sm },
  bubbleRow: { alignItems: 'flex-start' },
  bubbleRowOut: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: Radius.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  bubbleIn: { backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER },
  bubbleText: { fontSize: FontSizes.sm, color: TEXT_PRIMARY, lineHeight: 20 },
  bubbleTextOut: { color: WHITE },
  bubbleMeta: { fontSize: FontSizes.xs, color: TEXT_SECONDARY, marginTop: 2 },
  bubbleMetaFailed: { color: DANGER },

  composer: { borderTopWidth: 1, borderTopColor: BORDER, padding: Spacing.md },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 120 },
  sendBtn: { borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  sendBtnBusy: { opacity: 0.6 },
  sendError: { fontSize: FontSizes.sm, color: DANGER, marginBottom: Spacing.sm },
  counter: { fontSize: FontSizes.xs, color: TEXT_SECONDARY, marginTop: Spacing.xs },
});
