import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { PrimaryButton } from '@/components/primary-button';
import { Spacing, FontSizes, BRAND_RED, BRAND_RED_HOVER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE, OFF_WHITE, BORDER, Radius, CardShadow, DANGER_BG, DANGER_BORDER, getRoleTheme } from '@/constants/theme';
import type { RoleThemeKey } from '@/constants/theme';
import { signUpResponder } from '@/lib/auth-service';

const MIN_PASSWORD_LENGTH = 6;
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
  const [role, setRole] = useState<RoleThemeKey>('firefighter');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    setError(null);
    const u = username.trim();
    const e = email.trim();
    const p = password;
    const name = fullName.trim();
    const ph = phone.trim();

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
    if (!p) {
      setError('Password is required.');
      return;
    }
    if (p.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
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
            placeholder="Juan Dela Cruz"
            placeholderTextColor={TEXT_SECONDARY}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Choose a username"
            placeholderTextColor={TEXT_SECONDARY}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={TEXT_SECONDARY}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="09XXXXXXXXX"
            placeholderTextColor={TEXT_SECONDARY}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            placeholderTextColor={TEXT_SECONDARY}
            secureTextEntry
          />

          <Text style={styles.label}>Rank / Position (optional)</Text>
          <TextInput
            style={styles.input}
            value={rank}
            onChangeText={setRank}
            placeholder="e.g. Patrol Officer"
            placeholderTextColor={TEXT_SECONDARY}
          />

          <Text style={styles.label}>Office / Station (optional)</Text>
          <TextInput
            style={styles.input}
            value={office}
            onChangeText={setOffice}
            placeholder="e.g. Makati Police Station 1"
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
                  onPress={() => setRole(r.key)}
                  style={[styles.roleBtn, isActive && { borderColor: roleColor, backgroundColor: OFF_WHITE }]}
                >
                  <Text style={[styles.roleBtnText, isActive && { color: roleColor, fontWeight: '600' }]}>{r.label}</Text>
                </Pressable>
              );
            })}
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