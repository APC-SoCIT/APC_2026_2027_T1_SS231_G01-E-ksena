import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '@/components/primary-button';
import {
  Spacing,
  FontSizes,
  BRAND_RED,
  BRAND_RED_HOVER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
  OFF_WHITE,
  BORDER,
  Radius,
  CardShadow,
  SUCCESS,
  SUCCESS_BG,
  DANGER_BG,
  DANGER_BORDER,
} from '@/constants/theme';
import { sendPasswordReset } from '@/lib/auth-service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setError(null);
    const e = email.trim();
    if (!EMAIL_PATTERN.test(e)) {
      setError('Enter a valid email address.');
      return;
    }
    setSending(true);
    try {
      await sendPasswordReset(e);
      setSent(true);
    } catch (err) {
      setError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not send the reset link.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.card, CardShadow]}>
          <Pressable onPress={() => router.replace('/')} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={18} color={TEXT_SECONDARY} />
            <Text style={styles.backText}>Back to log in</Text>
          </Pressable>

          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.subtitle}>
            Enter the email you registered with and we will send you a link to set a new password.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {sent ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                If an account exists for that address, a reset link is on its way. The link expires, so use it soon,
                and check your spam folder if it does not arrive.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={TEXT_SECONDARY}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
              />
              <PrimaryButton
                title={sending ? 'Sending…' : 'Send reset link'}
                onPress={handleSend}
                style={styles.button}
                disabled={sending}
                color={BRAND_RED}
                hoverColor={BRAND_RED_HOVER}
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg, paddingVertical: Spacing.xl },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: Spacing.xl,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: Spacing.md },
  backText: { fontSize: FontSizes.sm, color: TEXT_SECONDARY },
  title: { fontSize: FontSizes.title, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, lineHeight: 20, marginBottom: Spacing.lg },
  label: { fontSize: FontSizes.sm, fontWeight: '500', color: TEXT_PRIMARY, marginBottom: Spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    backgroundColor: WHITE,
    marginBottom: Spacing.md,
  },
  button: { marginTop: Spacing.xs },
  errorBox: {
    backgroundColor: DANGER_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { fontSize: FontSizes.sm, color: BRAND_RED },
  successBox: {
    backgroundColor: SUCCESS_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: SUCCESS,
    padding: Spacing.md,
  },
  successText: { fontSize: FontSizes.sm, color: SUCCESS, lineHeight: 19 },
});
