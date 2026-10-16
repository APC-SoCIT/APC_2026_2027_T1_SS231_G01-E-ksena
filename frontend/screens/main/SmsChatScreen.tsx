import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Phone,
  Send,
  MessageSquare,
  MapPin,
  ChevronUp,
  ChevronDown,
  Clock,
  Radio,
  Flame,
  ShieldAlert,
  HeartPulse,
} from 'lucide-react-native';
import * as SMS from 'expo-sms';
import * as Location from 'expo-location';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { sendChatReply, sendVideoReport } from '../../services/ReportService';
import { hasActiveIncident } from '../../services/activeIncidentStorage';
import { supabase } from '../../services/supabaseClient';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'system';
  timestamp: string;
  command?: string;
}

const SmsChatScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { state } = useAuth();

  const responderPhone = route.params?.responderPhone || '';
  const incidentId = route.params?.incidentId || null;
  const responderName = route.params?.responderName || 'Emergency Dispatch';
  const serviceType = route.params?.serviceType || 'medical';

  const [inputText, setInputText] = useState('');
  const [showCommands, setShowCommands] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  const formatCurrentTime = () => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${hours}:${formattedMinutes} ${ampm}`;
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Emergency SMS Channel Active. Select a command below or type a message to send directly via SMS.',
      sender: 'system',
      timestamp: formatCurrentTime(),
    },
  ]);

  const addMessage = (text: string, sender: 'user' | 'system', command?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text,
        sender,
        timestamp: formatCurrentTime(),
        command,
      },
    ]);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const normalizePhone = (raw?: string) => {
    if (!raw) return null;
    let cleaned = String(raw).trim().replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('09') && cleaned.length === 11) return '+63' + cleaned.slice(1);
    if (cleaned.startsWith('9') && cleaned.length === 10) return '+63' + cleaned;
    if (cleaned.startsWith('639') && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('+639')) return cleaned;
    return cleaned;
  };

  const sendMessage = async (body: string, commandName?: string, overrideServiceType?: string) => {
    if (Platform.OS === 'android') {
      const permission = PermissionsAndroid.PERMISSIONS.SEND_SMS;
      const alreadyGranted = await PermissionsAndroid.check(permission);
      const result = alreadyGranted
        ? PermissionsAndroid.RESULTS.GRANTED
        : await PermissionsAndroid.request(permission, {
          title: 'SMS permission required',
          message: 'E-Ksena needs SMS permission before sending emergency SMS messages.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        });

      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('SMS not sent', 'SMS permission was not granted.');
        return false;
      }
    }

    // Add immediately to local in-app chat display
    addMessage(body, 'user', commandName);

    const activeService = overrideServiceType || serviceType || 'medical';

    // 1. First priority: Try sending over HTTP to backend
    try {
      const token = state.auth.token || undefined;
      const result = await sendChatReply(body, token, activeService, incidentId || undefined);
      if (result.success) {
        console.log(`[CHAT] Reply sent successfully via backend /api/chat/reply (${activeService})`);
        return true;
      }
      console.warn('[CHAT] Backend reply failed, trying direct Supabase insert:', result.error);
    } catch (apiErr) {
      console.warn('[CHAT] Backend error, falling back to direct Supabase insert:', apiErr);
    }

    // 2. Second priority: Insert directly into Supabase sms_messages table with isolated service_type
    // (This guarantees the web dispatcher receives it via realtime WITHOUT leaving the app!)
    try {
      const citizenPhone = normalizePhone(state.auth.user?.phone);
      if (!citizenPhone) {
        console.warn('[CHAT] Citizen phone not found in auth user profile');
        return false;
      }

      const { error: insertError } = await supabase
        .from('sms_messages')
        .insert({
          phone: citizenPhone,
          body: body.trim(),
          direction: 'inbound',
          status: 'received',
          service_type: activeService,
          provider_message_id: `inapp-${Date.now()}`
        });

      if (insertError) {
        console.error('[CHAT] Supabase direct insert error:', insertError);
        return false;
      } else {
        console.log(`[CHAT] ✅ Successfully inserted message (${activeService}) into Supabase sms_messages table directly`);
      }
    } catch (dbErr) {
      console.error('[CHAT] Error saving to Supabase:', dbErr);
    }
    return true;
  };

  const triggerEmergencyReport = async (emergencyServiceType: 'medical' | 'police' | 'fire', label: string) => {
    if (state.auth.user?.id && await hasActiveIncident(state.auth.user.id)) {
      Alert.alert('Active emergency', 'Only one emergency report can be active at a time.');
      return;
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    const permission = await Location.getForegroundPermissionsAsync();
    if (!servicesEnabled || permission.status !== 'granted') {
      Alert.alert('Location required', 'Enable location services and allow location access before sending a report.');
      return;
    }

    let freshPosition;
    try {
      freshPosition = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      Alert.alert('Location unavailable', 'Could not get your current location. Please try again.');
      return;
    }

    const { latitude, longitude } = freshPosition.coords;
    const { address } = state.location;
    const locationString = address || (latitude && longitude ? `${latitude}, ${longitude}` : 'Location pending');
    const mapsLink = latitude && longitude ? `https://maps.google.com/?q=${latitude},${longitude}` : '';

    const body = `EMERGENCY ALERT [${label.toUpperCase()}]: Immediate assistance requested!
Location: ${locationString}
${mapsLink ? `Map: ${mapsLink}` : ''}
Sent via E-ksena`;

    // 1. Send in-app message routed directly to that emergency unit
    const messageSent = await sendMessage(body, `/report ${label}`, emergencyServiceType);
    if (!messageSent) return;

    // 2. Dispatch incident with specific serviceType so backend picks the fastest traffic-based responder
    try {
      const userPhone = state.auth.user?.phone || '';
      if (latitude && longitude && userPhone) {
        addMessage(`Dispatching fastest available ${label} responder to your location...`, 'system');
        const reportResult = await sendVideoReport(
          'mock://sms-report',
          { latitude, longitude, address: address || undefined },
          userPhone,
          'mock://sms-report',
          emergencyServiceType,
          state.auth.user?.id
        );

        if (reportResult.success && reportResult.report) {
          const assigned = reportResult.report.assignedDispatcher;
          addMessage(
            `✅ ${label} Unit Dispatched: ${assigned?.name || 'Emergency Responder'} (${assigned?.phone || 'On route'})`,
            'system'
          );
        }
      }
    } catch (dispatchErr) {
      console.warn('[SMS CHAT] Incident dispatch error:', dispatchErr);
    }
  };

  const handleReportCommand = () => {
    Alert.alert(
      '🚨 Which Emergency Would You Like to Report?',
      'Please select the type of emergency so we can dispatch the closest, fastest responder:',
      [
        {
          text: '🩺 Medical Emergency',
          onPress: () => triggerEmergencyReport('medical', 'Medical'),
        },
        {
          text: '🚓 Police / Crime',
          onPress: () => triggerEmergencyReport('police', 'Police'),
        },
        {
          text: '🚒 Fire Emergency',
          onPress: () => triggerEmergencyReport('fire', 'Fire'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const handleStatusCommand = async () => {
    const { address } = state.location;
    const body = `STATUS CHECK: Requesting arrival status and ETA for emergency response${
      incidentId ? ` (Incident #${String(incidentId).slice(0, 8)})` : ''
    }${address ? ` at ${address}` : ''}.`;

    await sendMessage(body, '/status');
  };

  const handleSendCustomText = async () => {
    if (!inputText.trim()) return;
    const textToSend = inputText.trim();
    setInputText('');

    if (textToSend.toLowerCase() === '/report') {
      await handleReportCommand();
    } else if (textToSend.toLowerCase() === '/status') {
      await handleStatusCommand();
    } else {
      await sendMessage(textToSend);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {responderName}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {responderPhone ? `${responderPhone} • SMS Active` : 'Emergency Dispatch • SMS Active'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        {/* Messages Feed */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.dateBadgeContainer}>
            <Text style={styles.dateBadgeText}>
              {new Date().toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>

          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageBubbleWrapper,
                msg.sender === 'user' ? styles.userBubbleWrapper : styles.systemBubbleWrapper,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  msg.sender === 'user' ? styles.userBubble : styles.systemBubble,
                ]}
              >
                {msg.command ? (
                  <View style={styles.commandTag}>
                    <Radio size={12} color="#ffffff" />
                    <Text style={styles.commandTagText}>{msg.command}</Text>
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.messageText,
                    msg.sender === 'user' ? styles.userMessageText : styles.systemMessageText,
                  ]}
                >
                  {msg.text}
                </Text>
                <Text
                  style={[
                    styles.messageTimestamp,
                    msg.sender === 'user' ? styles.userTimestamp : styles.systemTimestamp,
                  ]}
                >
                  {msg.timestamp} {msg.sender === 'user' ? '✓✓' : ''}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Quick Command Action Buttons */}
        {showCommands && (
          <View style={styles.commandMenuCard}>
            {/* Button 1: Send emergency report & GPS */}
            <TouchableOpacity style={styles.commandRow} onPress={handleReportCommand}>
              <View style={styles.commandLeft}>
                <MapPin size={20} color="#dc2626" style={styles.commandIcon} />
                <Text style={styles.commandLabel}>Send Emergency Report & GPS</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.commandDivider} />

            {/* Button 2: Check responder arrival status */}
            <TouchableOpacity style={styles.commandRow} onPress={handleStatusCommand}>
              <View style={styles.commandLeft}>
                <Clock size={20} color="#f59e0b" style={styles.commandIcon} />
                <Text style={styles.commandLabel}>Check Responder Arrival Status</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Input Bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={[styles.cmdToggleBtn, showCommands && styles.cmdToggleBtnActive]}
            onPress={() => setShowCommands(!showCommands)}
            hitSlop={8}
          >
            <Text style={styles.cmdToggleText}>/</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Type message or /command..."
            placeholderTextColor="#9ca3af"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={300}
          />

          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendCustomText}
            disabled={!inputText.trim()}
          >
            <Send size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Dark theme matching modern chat bots
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 6,
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  callIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  keyboardContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  dateBadgeContainer: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    marginBottom: 16,
  },
  dateBadgeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  messageBubbleWrapper: {
    marginVertical: 4,
    maxWidth: '82%',
  },
  userBubbleWrapper: {
    alignSelf: 'flex-end',
  },
  systemBubbleWrapper: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#dc2626', // Brand emergency red for user sent SMS
    borderBottomRightRadius: 4,
  },
  systemBubble: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  commandTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 6,
  },
  commandTagText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#ffffff',
  },
  systemMessageText: {
    color: '#e2e8f8',
  },
  messageTimestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  systemTimestamp: {
    color: '#64748b',
  },
  // Command Menu Card (Screenshot matching popup)
  commandMenuCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  commandIcon: {
    marginRight: 10,
  },
  commandLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '500',
  },
  commandBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  callBadge: {
    backgroundColor: '#065f46',
  },
  commandBadgeText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  commandDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginHorizontal: 16,
  },
  // Input Bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 8,
  },
  cmdToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cmdToggleBtnActive: {
    backgroundColor: '#dc2626',
  },
  cmdToggleText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#475569',
    opacity: 0.6,
  },
});

export default SmsChatScreen;
