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
  Alert,
  Linking,
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
} from 'lucide-react-native';
import * as SMS from 'expo-sms';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { sendChatReply } from '../../services/ReportService';

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

  const responderPhone = route.params?.responderPhone || '+639123456789';
  const incidentId = route.params?.incidentId || null;
  const responderName = route.params?.responderName || 'Emergency Dispatch';

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

  const sendMessage = async (body: string, commandName?: string) => {
    // Add immediately to local message state
    addMessage(body, 'user', commandName);

    // 1. Try sending over HTTP to backend (Option 2 fallback: updates sms_messages immediately for Web App)
    try {
      const token = state.auth.token || undefined;
      const result = await sendChatReply(body, token);
      if (result.success) {
        console.log('[CHAT] Reply sent successfully to backend sms_messages');
        return;
      }
      console.warn('[CHAT] Backend reply failed, falling back to native SMS:', result.error);
    } catch (apiErr) {
      console.warn('[CHAT] API connection error, falling back to native SMS:', apiErr);
    }

    // 2. Fallback to native SMS if offline or backend is unreachable
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'SMS Not Available',
          'Could not reach server or native SMS service. Would you like to call the hotline?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Call Hotline',
              onPress: () => Linking.openURL(`tel:${responderPhone}`),
            },
          ]
        );
        return;
      }

      await SMS.sendSMSAsync([responderPhone], body);
    } catch (smsErr) {
      console.error('[SMS] Error sending SMS fallback:', smsErr);
    }
  };

  const handleReportCommand = async () => {
    const { latitude, longitude, address } = state.location;
    const locationString = address || (latitude && longitude ? `${latitude}, ${longitude}` : 'Location pending');
    const mapsLink = latitude && longitude ? `https://maps.google.com/?q=${latitude},${longitude}` : '';

    const body = `EMERGENCY ALERT: I need immediate assistance!
Location: ${locationString}
${mapsLink ? `Map: ${mapsLink}` : ''}
${incidentId ? `Incident ID: #${String(incidentId).slice(0, 8)}` : ''}
Sent via E-ksena`;

    await sendMessage(body, '/report');
  };

  const handleStatusCommand = async () => {
    const { address } = state.location;
    const body = `STATUS CHECK: Requesting arrival status and ETA for emergency response${
      incidentId ? ` (Incident #${String(incidentId).slice(0, 8)})` : ''
    }${address ? ` at ${address}` : ''}.`;

    await sendMessage(body, '/status');
  };

  const handleCallCommand = () => {
    Alert.alert(
      'Emergency Call',
      'Select how you would like to connect to the responder:',
      [
        {
          text: 'Live Video Call',
          onPress: () => {
            (navigation as any).navigate('CallScreen', {
              incidentId: incidentId || 'direct-emergency',
              responderPhone,
            });
          },
        },
        {
          text: 'Cellular Phone Call',
          onPress: () => Linking.openURL(`tel:${responderPhone}`),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleSendCustomText = async () => {
    if (!inputText.trim()) return;
    const textToSend = inputText.trim();
    setInputText('');

    if (textToSend.toLowerCase() === '/report') {
      await handleReportCommand();
    } else if (textToSend.toLowerCase() === '/status') {
      await handleStatusCommand();
    } else if (textToSend.toLowerCase() === '/call') {
      handleCallCommand();
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
            {responderPhone} • SMS Active
          </Text>
        </View>

        <TouchableOpacity style={styles.callIconBtn} onPress={handleCallCommand}>
          <Phone size={20} color="#ffffff" />
        </TouchableOpacity>
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

            <View style={styles.commandDivider} />

            {/* Button 3: Live emergency call */}
            <TouchableOpacity style={styles.commandRow} onPress={handleCallCommand}>
              <View style={styles.commandLeft}>
                <Phone size={20} color="#10b981" style={styles.commandIcon} />
                <Text style={styles.commandLabel}>Live Emergency Call</Text>
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
