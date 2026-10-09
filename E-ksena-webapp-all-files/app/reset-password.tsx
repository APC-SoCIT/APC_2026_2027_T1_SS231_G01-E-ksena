import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
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
import { supabase, INITIAL_URL_HASH, INITIAL_URL_SEARCH } from '@/lib/supabase';
import { completePasswordReset, signOutResponder } from '@/lib/auth-service';
import { passwordProblems } from '@/lib/password';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const [linkError, setLinkError] = useState<string | null>(null);

  // The recovery link carries its tokens in the URL fragment; supabase-js reads
  // them and establishes a session, which may land just after this mounts.
  // When it refuses the token, the reason comes back in the URL instead - read
  // it, because "invalid, expired or used" covers three different problems with
  // three different fixes.
  useEffect(() => {
    let cancelled = false;

    const fromHash = new URLSearchParams(INITIAL_URL_HASH.replace(/^#/, ''));
    const fromQuery = new URLSearchParams(INITIAL_URL_SEARCH);
    const pick = (key: string) => fromHash.get(key) ?? fromQuery.get(key);

    // A session alone is not proof of recovery -- a responder who is merely
    // logged in has one too. Only a genuine recovery link may show the form,
    // or opening this URL in an unlocked browser would be enough to change
    // the password without knowing the current one.
    const codeParam = pick('code');
    const isRecoveryLink = pick('type') === 'recovery' || !!codeParam;

    const readUrlError = (): string | null => {
      const code = pick('error_code');
      const description = pick('error_description');
      if (!code && !description && !pick('error')) return null;
      const readable = description ? description.replace(/\+/g, ' ') : null;
      return code ? `${readable ?? 'The link was rejected'} (${code})` : readable;
    };

    (async () => {
      const urlError = readUrlError();
      if (urlError && !cancelled) setLinkError(urlError);

      // A PKCE-style link arrives as ?code=... and has to be exchanged.
      if (codeParam && !urlError) {
        const { error } = await supabase.auth.exchangeCodeForSession(codeParam);
        if (error && !cancelled) setLinkError(error.message);
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session && !isRecoveryLink && !urlError) {
        // Signed in and not here from a link: send them to the dashboard
        // rather than presenting a password form out of nowhere.
        router.replace('/(tabs)');
        return;
      }
      setHasRecoverySession(!!data.session && isRecoveryLink);
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || !session) return;
      if (event !== 'PASSWORD_RECOVERY' && !isRecoveryLink) return;
      setHasRecoverySession(true);
      setLinkError(null);
      setChecking(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSave = async () => {
    setError(null);
    const missing = passwordProblems(password);
    if (missing.length > 0) {
      setError(`Password needs ${missing.join(', ')}.`);
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await completePasswordReset(password);
      // Sign the recovery session out so the new password is actually used to
      // get back in, rather than leaving a session nobody authenticated for.
      await signOutResponder().catch(() => undefined);
      setDone(true);
    } catch (err) {
      setError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not set your new password.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.card, CardShadow]}>
          <Text style={styles.title}>Set a new password</Text>

          {done ? (
            <>
              <View style={styles.successBox}>
                <Text style={styles.successText}>
                  Your password has been changed. Log in with the new one.
                </Text>
              </View>
              <PrimaryButton
                title="Go to log in"
                onPress={() => router.replace('/')}
                style={styles.button}
                color={BRAND_RED}
                hoverColor={BRAND_RED_HOVER}
              />
            </>
          ) : checking ? (
            <Text style={styles.subtitle}>Checking your reset link…</Text>
          ) : !hasRecoverySession ? (
            <>
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {linkError ?? 'This reset link is invalid, has expired, or has already been used.'}
                </Text>
              </View>
              <Pressable onPress={() => router.replace('/forgot-password')} hitSlop={8} style={styles.linkBtn}>
                <Text style={styles.linkText}>Request a new link</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>Choose a password you have not used on this account before.</Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>New password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor={TEXT_SECONDARY}
                secureTextEntry
                autoCapitalize="none"
              />
              <Text style={styles.hint}>
                At least 8 characters, with an uppercase letter, a lowercase letter, a number and a special character.
              </Text>

              <Text style={styles.label}>Confirm new password</Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm new password"
                placeholderTextColor={TEXT_SECONDARY}
                secureTextEntry
                autoCapitalize="none"
              />

              <PrimaryButton
                title={saving ? 'Saving…' : 'Set new password'}
                onPress={handleSave}
                style={styles.button}
                disabled={saving}
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
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
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
  hint: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    lineHeight: 16,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  button: { marginTop: Spacing.xs },
  linkBtn: { alignSelf: 'center', marginTop: Spacing.md },
  linkText: { fontSize: FontSizes.sm, fontWeight: '600', color: BRAND_RED },
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
    marginBottom: Spacing.md,
  },
  successText: { fontSize: FontSizes.sm, color: SUCCESS, lineHeight: 19 },
});
