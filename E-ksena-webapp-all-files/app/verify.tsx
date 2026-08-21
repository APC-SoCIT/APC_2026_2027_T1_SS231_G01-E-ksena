import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  DANGER_BG,
  DANGER_BORDER,
  SUCCESS,
  SUCCESS_BG,
} from '@/constants/theme';
import { verifySignupOtp, resendSignupOtp } from '@/lib/auth-service';

export default function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    setError(null);
    setResent(false);
    if (!email) {
      setError('Missing email address. Please register again.');
      return;
    }
    if (!code.trim()) {
      setError('Enter the verification code sent to your email.');
      return;
    }
    setSubmitting(true);
    try {
      await verifySignupOtp(email, code.trim());
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResent(false);
    if (!email) return;
    setResending(true);
    try {
      await resendSignupOtp(email);
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.card, CardShadow]}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            We sent a verification code to {email ? <Text style={styles.emailText}>{email}</Text> : 'your email'}. Enter it below to activate your account.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {resent ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>A new code has been sent.</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Verification code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={TEXT_SECONDARY}
            keyboardType="number-pad"
          />

          <PrimaryButton
            title={submitting ? 'Verifying…' : 'Verify'}
            onPress={handleVerify}
            style={styles.button}
            disabled={submitting}
            color={BRAND_RED}
            hoverColor={BRAND_RED_HOVER}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Didn&apos;t get a code? </Text>
            <Pressable onPress={handleResend} disabled={resending} hitSlop={8}>
              <Text style={styles.link}>{resending ? 'Resending…' : 'Resend'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: OFF_WHITE,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.lg,
  },
  emailText: {
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  errorBox: {
    backgroundColor: DANGER_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: BRAND_RED,
  },
  successBox: {
    backgroundColor: SUCCESS_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: SUCCESS,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  successText: {
    fontSize: FontSizes.sm,
    color: SUCCESS,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
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
    marginBottom: Spacing.md,
    letterSpacing: 4,
  },
  button: {
    marginTop: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    flexWrap: 'wrap',
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
  },
  link: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: BRAND_RED,
  },
});