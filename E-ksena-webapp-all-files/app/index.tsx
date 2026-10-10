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
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'map-outline', text: 'Live emergency map for Makati City' },
  { icon: 'git-branch-outline', text: 'Incidents matched to your service' },
  { icon: 'navigate-outline', text: 'Turn-by-turn navigation to the scene' },
  { icon: 'videocam-outline', text: 'Live video from the caller' },
];

const WIDE_BREAKPOINT = 900;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const showRegisteredMessage = registered === '1';
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

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
        <View style={[styles.shell, wide && styles.shellWide]}>
          <LinearGradient
            colors={['#B5362B', '#92241C', '#6E1813']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.brandPanel, wide ? styles.brandPanelWide : styles.brandPanelNarrow]}
          >
            <View style={styles.brandMarkRow}>
              <View style={styles.brandMark}>
                <Ionicons name="shield-checkmark" size={wide ? 24 : 20} color={WHITE} />
              </View>
              <Text style={[styles.logo, !wide && styles.logoNarrow]}>E-ksena</Text>
            </View>
            <Text style={[styles.tagline, !wide && styles.taglineNarrow]}>
              Incident Reporting &amp; Response System
            </Text>

            {wide ? (
              <>
                <View style={styles.featureList}>
                  {FEATURES.map((f) => (
                    <View key={f.text} style={styles.featureRow}>
                      <Ionicons name={f.icon} size={17} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.featureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.brandFooter}>Asia Pacific College &middot; Group ALT_RUN</Text>
              </>
            ) : null}
          </LinearGradient>

          <View style={[styles.card, wide ? styles.cardWide : styles.cardNarrow]}>
            <Text style={styles.cardTitle}>Responder Signup</Text>

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

            <View style={styles.forgotRow}>
              <Link href="/forgot-password" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don&apos;t have an account? </Text>
              <Link href="/signup" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.link}>Registration</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.legalRow}>
              <Text style={styles.legalLink} onPress={() => router.push('/terms')}>
                Terms and Conditions
              </Text>
              <Text style={styles.legalSeparator}>{'·'}</Text>
              <Text style={styles.legalLink} onPress={() => router.push('/privacy')}>
                Privacy Policy
              </Text>
            </View>
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
  shell: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: WHITE,
    shadowColor: '#1C2126',
    shadowOpacity: 0.1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  shellWide: {
    flexDirection: 'row',
    maxWidth: 900,
    minHeight: 520,
  },
  brandPanel: {
    justifyContent: 'center',
  },
  brandPanelWide: {
    flex: 1,
    padding: Spacing.xl * 1.5,
  },
  brandPanelNarrow: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  brandMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  logo: {
    fontSize: 30,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: -0.5,
  },
  logoNarrow: {
    fontSize: 25,
  },
  tagline: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.78)',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  taglineNarrow: {
    textAlign: 'center',
  },
  featureList: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 19,
  },
  brandFooter: {
    marginTop: Spacing.xl * 1.5,
    fontSize: FontSizes.xs,
    color: 'rgba(255,255,255,0.55)',
  },
  card: {
    backgroundColor: WHITE,
    justifyContent: 'center',
  },
  cardWide: {
    flex: 1,
    padding: Spacing.xl * 1.5,
  },
  cardNarrow: {
    padding: Spacing.xl,
  },
  cardTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
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
  forgotRow: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    flexWrap: 'wrap',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  legalLink: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
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