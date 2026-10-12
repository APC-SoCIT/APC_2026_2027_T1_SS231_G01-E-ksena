import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { OFF_WHITE, WHITE, BORDER, TEXT_SECONDARY, FontSizes } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { RoleBadge } from '@/components/role-badge';

export default function TabLayout() {
  const { isResponder, isAdmin, isAdminOnly } = useAuth();
  const theme = useRoleTheme();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.classList.remove('theme-police', 'theme-firefighter', 'theme-medic', 'theme-admin');
      document.body.classList.add(theme.themeClass);
    }
  }, [theme.themeClass]);

  if (!isResponder && !isAdminOnly) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <Drawer
        screenOptions={{
          drawerPosition: 'left',
          headerStyle: {
            backgroundColor: theme.primary,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.15)',
          },
          headerTintColor: WHITE,
          headerTitleStyle: { fontWeight: '600', fontSize: FontSizes.subtitle },
          headerRight: () => <RoleBadge />,
          drawerActiveTintColor: theme.primary,
          drawerInactiveTintColor: TEXT_SECONDARY,
          drawerLabelStyle: { fontSize: FontSizes.body, fontWeight: '500' },
          drawerStyle: { backgroundColor: WHITE, borderRightWidth: 1, borderRightColor: BORDER },
        }}
      >
        {/* The screens a responder works from. An admin with no service gets
            none of them: managing accounts and videos is not dispatching. */}
        <Drawer.Protected guard={isResponder}>
          <Drawer.Screen name="index" options={{ title: 'Map', drawerLabel: 'Map' }} />
          <Drawer.Screen name="reports" options={{ title: 'Reports', drawerLabel: 'Reports' }} />
          <Drawer.Screen name="explore" options={{ title: 'Messages', drawerLabel: 'Messages' }} />
        </Drawer.Protected>
        {/* Gone from the menu, and from its address, for anyone who is not an
            admin. That is a convenience, not the security boundary -- Row
            Level Security in Supabase is. Declared ahead of Profile because
            the drawer opens on the first screen an account may reach, and for
            an admin with no service that should be this one. */}
        <Drawer.Protected guard={isAdmin}>
          <Drawer.Screen name="admin" options={{ title: 'Admin', drawerLabel: 'Admin' }} />
        </Drawer.Protected>
        <Drawer.Screen name="profile" options={{ title: 'Profile', drawerLabel: 'Profile' }} />
      </Drawer>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: OFF_WHITE,
  },
});