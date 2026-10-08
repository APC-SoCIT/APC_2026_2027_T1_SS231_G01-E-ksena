import type { ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { BRAND_RED, WHITE, OFF_WHITE, FontSizes } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth';
import { IncidentStatusProvider } from '@/context/incident-status';
import { RoleThemeProvider } from '@/context/role-theme';

function RootStack() {
  const { isResponder } = useAuth();
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
      <Stack.Protected guard={!isResponder}>
        <Stack.Screen name="index" options={{ title: 'Responder log in', headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: 'Responder registration', headerShown: true }} />
        <Stack.Screen name="verify" options={{ title: 'Verify email', headerShown: true }} />
      </Stack.Protected>
      <Stack.Protected guard={isResponder}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Details' }} />
      </Stack.Protected>
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
            <RootStack />
          </AuthGate>
        </IncidentStatusProvider>
      </RoleThemeProvider>
    </AuthProvider>
  );
}
