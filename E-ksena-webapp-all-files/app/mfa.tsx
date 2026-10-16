import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
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
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
} from '@/constants/theme';

type Setup = { factorId: string; qr: string; secret: string };

function errorText(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
}

/**
 * The second sign-in step (S-02): a six-digit code from an authenticator app,
 * such as Google Authenticator or Microsoft Authenticator.
 *
 * Required for every account. One that has never set it up is shown a QR code
 * to add E-ksena to the app; after that, every sign-in asks for the current
 * code. The dashboard does not open until the code is accepted.
 */
export default function MfaScreen() {
  const { mfaStatus, refreshMfa, logout, accountEmail } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(true);

  const enrolling = mfaStatus === 'enroll';

  // Finds the authenticator to check against, or starts setting one up.
  const prepare = useCallback(async () => {
    setPreparing(true);
    setError(null);
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setSetup(null);
        return;
      }
      // A setup that was started and never finished blocks a new one, so it
      // is removed first.
      for (const f of data.all) {
        if (f.factor_type === 'totp' && f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `E-ksena ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError) throw enrollError;
      setFactorId(enrolled.id);
      setSetup({ factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPreparing(false);
    }
  }, []);

  useEffect(() => {
    if (mfaStatus === 'enroll' || mfaStatus === 'verify') prepare();
  }, [mfaStatus, prepare]);

  const submit = async () => {
    setError(null);
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('Enter the 6-digit code shown in your authenticator app.');
      return;
    }
    if (!factorId) {
      setError('The authenticator is not ready yet. Wait a moment and try again.');
      return;
    }
    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: digits });
      if (verifyError) throw verifyError;
      setCode('');
      await refreshMfa();
    } catch (err) {
      const message = errorText(err);
      setError(
        /invalid|expired|code/i.test(message)
          ? 'That code is wrong or has expired. Enter the code currently shown in your authenticator app.'
          : message
      );
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await logout();
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (mfaStatus === 'unknown' || preparing) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={BRAND_RED} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, CardShadow]}>
        <Text style={styles.title}>Two-step verification</Text>
        <Text style={styles.subtitle}>{accountEmail}</Text>

        {enrolling && setup ? (
          <>
            <Text style={styles.text}>
              Every responder account needs a second step at sign-in. Set it up once:
            </Text>
            <Text style={styles.step}>1. Install an authenticator app, such as Google Authenticator.</Text>
            <Text style={styles.step}>2. In the app, add an account and scan this QR code.</Text>
            <View style={styles.qrBox}>
              <img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} />
            </View>
            <Text style={styles.small}>Can&apos;t scan it? Enter this key in the app instead:</Text>
            <Text style={styles.secret} selectable>
              {setup.secret}
            </Text>
            <Text style={styles.step}>3. Enter the 6-digit code the app shows.</Text>
          </>
        ) : (
          <Text style={styles.text}>Enter the 6-digit code from your authenticator app.</Text>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
          onSubmitEditing={submit}
          placeholder="123456"
          placeholderTextColor={TEXT_SECONDARY}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          accessibilityLabel="Authentication code"
        />
        <PrimaryButton
          title={busy ? 'Checking…' : enrolling ? 'Turn on and continue' : 'Verify'}
          onPress={submit}
          disabled={busy}
          color={BRAND_RED}
          hoverColor={BRAND_RED_HOVER}
        />

        <Pressable onPress={signOut} style={styles.linkBtn} accessibilityRole="button">
          <Text style={styles.link}>Log out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg, backgroundColor: OFF_WHITE },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
  },
  title: { fontSize: FontSizes.title, fontWeight: '700', color: TEXT_PRIMARY },
  subtitle: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, marginBottom: Spacing.lg },
  text: { fontSize: FontSizes.body, color: TEXT_PRIMARY, marginBottom: Spacing.md, lineHeight: 22 },
  step: { fontSize: FontSizes.sm, color: TEXT_PRIMARY, marginBottom: Spacing.sm, lineHeight: 20 },
  qrBox: { alignItems: 'center', marginVertical: Spacing.md },
  small: { fontSize: FontSizes.xs, color: TEXT_SECONDARY },
  secret: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.title,
    letterSpacing: 6,
    textAlign: 'center',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.md,
  },
  errorBox: {
    backgroundColor: DANGER_BG,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { fontSize: FontSizes.sm, color: DANGER },
  linkBtn: { alignSelf: 'center', marginTop: Spacing.md, padding: Spacing.xs },
  link: { fontSize: FontSizes.sm, fontWeight: '600', color: BRAND_RED },
});
