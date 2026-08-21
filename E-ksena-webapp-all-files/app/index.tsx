import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
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
import { signInResponder } from '@/lib/auth-service';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const showRegisteredMessage = registered === '1';

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInResponder(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not log in.';
      if (/email not confirmed/i.test(message)) {
        router.push({ pathname: '/verify', params: { email: email.trim() } });
        return;
      }
      setError(/invalid login credentials/i.test(message) ? 'Incorrect email or password.' : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.logo}>E-ksena</Text>
          <Text style={styles.tagline}>Incident Reporting &amp; Response System</Text>
        </View>

        <View style={[styles.card, CardShadow]}>
          <Text style={styles.cardTitle}>Responder log in</Text>

          {showRegisteredMessage ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>Account created. Check your email for a verification code, then log in.</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={TEXT_SECONDARY}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={TEXT_SECONDARY}
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={styles.eyeButton}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={TEXT_SECONDARY} />
            </Pressable>
          </View>

          <PrimaryButton
            title={loading ? 'Logging in…' : 'Log in'}
            onPress={handleLogin}
            style={styles.button}
            disabled={loading}
            color={BRAND_RED}
            hoverColor={BRAND_RED_HOVER}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <Link href="/signup" asChild>
              <Pressable hitSlop={8}>
                <Text style={styles.link}>Registration</Text>
              </Pressable>
            </Link>
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
    padding: Spacing.lg,
    paddingTop: Spacing.xl * 2,
    paddingBottom: Spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logo: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND_RED,
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginTop: Spacing.xs,
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
  cardTitle: {
    fontSize: FontSizes.title,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.lg,
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
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    backgroundColor: WHITE,
    marginBottom: Spacing.md,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
  },
  eyeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
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