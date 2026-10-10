import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { PrimaryButton } from '@/components/primary-button';
import { Spacing, FontSizes, BRAND_RED, BRAND_RED_HOVER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE, OFF_WHITE, BORDER, Radius, CardShadow, DANGER_BG, DANGER_BORDER, getRoleTheme } from '@/constants/theme';
import type { RoleThemeKey } from '@/constants/theme';
import { signUpResponder } from '@/lib/auth-service';
import { PhoneInput, toE164, isValidPhone } from '@/components/phone-input';
import { passwordProblems, MIN_PASSWORD_LENGTH } from '@/lib/password';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES: { key: RoleThemeKey; label: string }[] = [
  { key: 'police', label: 'Police' },
  { key: 'firefighter', label: 'Firefighter' },
  { key: 'medic', label: 'Medic' },
];

export default function SignupScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [rank, setRank] = useState('');
  const [office, setOffice] = useState('');
  const [role, setRole] = useState<RoleThemeKey | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    setError(null);
    const u = username.trim();
    const e = email.trim();
    const p = password;
    const name = fullName.trim();
    const ph = toE164(phone);

    if (!u) {
      setError('Username is required.');
      return;
    }
    if (!name) {
      setError('Full name is required.');
      return;
    }
    if (!e || !EMAIL_PATTERN.test(e)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!ph) {
      setError('Phone number is required.');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('Enter a valid phone number.');
      return;
    }
    if (!p) {
      setError('Password is required.');
      return;
    }
    const missing = passwordProblems(p);
    if (missing.length > 0) {
      setError(`Password needs ${missing.join(', ')}.`);
      return;
    }
    if (!role) {
      setError('Select your role.');
      return;
    }
    // Consent has to be a deliberate act, so the box starts unticked and
    // registration stops here until it is ticked. The Data Privacy Act treats
    // pre-ticked or assumed agreement as no consent at all.
    if (!accepted) {
      setError('Please accept the Terms and Conditions and the Privacy Policy.');
      return;
    }

    setSubmitting(true);
    try {
      const { needsVerification } = await signUpResponder({
        email: e,
        password: p,
        username: u,
        role,
        fullName: name,
        phone: ph,
        rank: rank.trim() || undefined,
        office: office.trim() || undefined,
      });
      if (needsVerification) {
        router.replace({ pathname: '/verify', params: { email: e } });
      } else {
        router.replace('/?registered=1');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(/already registered/i.test(message) ? 'An account with this email already exists.' : message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.card, CardShadow]}>
          <Text style={styles.title}>Responder registration</Text>
          <Text style={styles.subtitle}>Create an account with your real contact information. We&apos;ll email you a code to verify it.</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your Full Name"
            placeholderTextColor={TEXT_SECONDARY}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor={TEXT_SECONDARY}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={TEXT_SECONDARY}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Phone number</Text>
          <PhoneInput value={phone} onChange={setPhone} />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={TEXT_SECONDARY}
            secureTextEntry
          />
          <Text style={styles.hint}>
            At least {MIN_PASSWORD_LENGTH} characters, with an uppercase letter, a lowercase letter, a number and a
            special character.
          </Text>

          <Text style={styles.label}>Rank</Text>
          <TextInput
            style={styles.input}
            value={rank}
            onChangeText={setRank}
            placeholder="Rank"
            placeholderTextColor={TEXT_SECONDARY}
          />

          <Text style={styles.label}>Office</Text>
          <TextInput
            style={styles.input}
            value={office}
            onChangeText={setOffice}
            placeholder="Office"
            placeholderTextColor={TEXT_SECONDARY}
          />

          <Text style={styles.label}>Role</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => {
              const isActive = role === r.key;
              const roleColor = getRoleTheme(r.key).primary;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => { setRole(r.key); setError(null); }}
                  style={[styles.roleBtn, isActive && { borderColor: roleColor, backgroundColor: OFF_WHITE }]}
                >
                  <Text style={[styles.roleBtnText, isActive && { color: roleColor, fontWeight: '600' }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.consentRow}>
            <Pressable
              onPress={() => { setAccepted((prev) => !prev); setError(null); }}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              style={[styles.checkbox, accepted && styles.checkboxOn]}
            >
              {accepted ? <Text style={styles.checkmark}>{'✓'}</Text> : null}
            </Pressable>
            <Text style={styles.consentText}>
              I have read and accept the{' '}
              <Text style={styles.link} onPress={() => router.push('/terms')}>
                Terms and Conditions
              </Text>
              {' '}and the{' '}
              <Text style={styles.link} onPress={() => router.push('/privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </View>

          <PrimaryButton
            title={submitting ? 'Creating account…' : 'Save'}
            onPress={handleSignup}
            style={styles.button}
            disabled={submitting}
            color={BRAND_RED}
            hoverColor={BRAND_RED_HOVER}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/" asChild>
              <Pressable hitSlop={8}>
                <Text style={styles.link}>Log in</Text>
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
  passwordInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    backgroundColor: WHITE,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.md,
    lineHeight: 16,
  },
  roleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  roleBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: TEXT_SECONDARY,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: {
    backgroundColor: BRAND_RED,
    borderColor: BRAND_RED,
  },
  checkmark: {
    color: WHITE,
    fontSize: FontSizes.xs,
    fontWeight: '700',
    lineHeight: 16,
  },
  consentText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    lineHeight: 18,
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