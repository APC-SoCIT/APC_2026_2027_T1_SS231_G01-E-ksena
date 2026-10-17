import { useEffect, useRef, type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { BRAND_RED, WHITE, OFF_WHITE, FontSizes } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth';
import { INITIAL_URL_HASH, INITIAL_URL_SEARCH } from '@/lib/supabase';
import { IncidentStatusProvider } from '@/context/incident-status';
import { RoleThemeProvider } from '@/context/role-theme';
import { OfflineBanner } from '@/components/offline-banner';

/**
 * Supabase sends the recovery token to the project's Site URL when the
 * redirect it was given is not on the allow list, which drops the responder on
 * the site root carrying `type=recovery` in the fragment. supabase-js then
 * reads that fragment and signs them in, so the guards swap to the dashboard
 * and the reset screen is never reached: the recovery link quietly becomes a
 * login link, and the password it was sent to change stays as it was.
 *
 * Catching it here means the flow survives a misconfigured Site URL, though
 * the allow list is still the thing to fix.
 */
function useRecoveryRedirect() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const isRecovery =
      INITIAL_URL_HASH.includes('type=recovery') || INITIAL_URL_SEARCH.includes('type=recovery');
    if (!isRecovery) return;
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/reset-password')) return;
    handled.current = true;
    router.replace('/reset-password');
  }, [router]);
}

/**
 * Whether every account must pass the two-step code screen (app/mfa.tsx)
 * before the dashboard opens. Switched off for now, so sign-in needs only the
 * password; set it back to true to require the authenticator code again.
 * Accounts that already set up an authenticator keep it either way.
 */
const MFA_REQUIRED = false;

function RootStack() {
  const { isResponder, isAdminOnly, mfaStatus } = useAuth();
  // An admin with no service is let in as well; which screens it then finds
  // inside is decided by the drawer. Either way the second sign-in step has to
  // be done first: until then the only screen is the code screen.
  const signedIn = isResponder || isAdminOnly;
  const mfaDone = !MFA_REQUIRED || mfaStatus === 'ok';
  const canEnter = signedIn && mfaDone;
  const needsMfa = signedIn && !mfaDone;
  useRecoveryRedirect();
  const headerOptions = {
    headerStyle: { backgroundColor: BRAND_RED },
    headerTintColor: WHITE,
    headerTitleStyle: { fontWeight: '600' as const, fontSize: FontSizes.subtitle },
  };

  // Stack.Protected drops the screens this session may not reach and falls back to
  // the first one left. Redirecting by hand replaced the navigator instead of a
  // screen, so the URL changed but nothing rendered - the blank page after logout.
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Protected guard={needsMfa}>
        <Stack.Screen name="mfa" options={{ title: 'Two-step verification', headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="index" options={{ title: 'Responder log in', headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: 'Responder registration', headerShown: true }} />
        <Stack.Screen name="verify" options={{ title: 'Verify email', headerShown: true }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Forgot password', headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={canEnter}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Details' }} />
      </Stack.Protected>
      {/* Outside both guards on purpose: the recovery link signs the responder
          in, so a signed-out-only guard would remove this screen underneath
          them and send them to the dashboard without setting a password.
          It has to stay last, though -- the fallback is the first surviving
          screen, so declaring it earlier sent every signed-in responder here
          instead of to the dashboard whenever they opened the site root. */}
      <Stack.Screen name="reset-password" options={{ title: 'Set a new password', headerShown: false }} />
      {/* Readable whether or not anyone is signed in: a visitor has to be able
          to read what they are agreeing to before they agree to it. */}
      <Stack.Screen name="terms" options={{ title: 'Terms and Conditions', headerShown: true }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy Policy', headerShown: true }} />
    </Stack>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE }}>
        <ActivityIndicator size="large" color={BRAND_RED} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RoleThemeProvider>
        <IncidentStatusProvider>
          <AuthGate>
            <View style={{ flex: 1 }}>
              <OfflineBanner />
              <RootStack />
            </View>
          </AuthGate>
        </IncidentStatusProvider>
      </RoleThemeProvider>
    </AuthProvider>
  );
}
