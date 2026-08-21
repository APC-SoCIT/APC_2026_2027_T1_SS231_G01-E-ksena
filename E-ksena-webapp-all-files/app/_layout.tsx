import { View, ActivityIndicator } from 'react-native';
import { Stack, Redirect, usePathname } from 'expo-router';
import { BRAND_RED, WHITE, OFF_WHITE, FontSizes } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth';
import { IncidentStatusProvider } from '@/context/incident-status';
import { RoleThemeProvider } from '@/context/role-theme';

function RootStack() {
  const headerOptions = {
    headerStyle: { backgroundColor: BRAND_RED },
    headerTintColor: WHITE,
    headerTitleStyle: { fontWeight: '600' as const, fontSize: FontSizes.subtitle },
  };

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Responder log in', headerShown: true }} />
      <Stack.Screen name="signup" options={{ title: 'Responder registration', headerShown: true }} />
      <Stack.Screen name="verify" options={{ title: 'Verify email', headerShown: true }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Details' }} />
    </Stack>
  );
}

const PUBLIC_ROUTES = ['/', '/signup', '/verify'];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isResponder, loading } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE }}>
        <ActivityIndicator size="large" color={BRAND_RED} />
      </View>
    );
  }

  if (!isResponder && !isPublicRoute) {
    return <Redirect href="/" />;
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RoleThemeProvider>
        <IncidentStatusProvider>
          <AuthGuard>
            <RootStack />
          </AuthGuard>
        </IncidentStatusProvider>
      </RoleThemeProvider>
    </AuthProvider>
  );
}