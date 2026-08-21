import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { OFF_WHITE, WHITE, BORDER, TEXT_SECONDARY, FontSizes } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { RoleBadge } from '@/components/role-badge';

export default function TabLayout() {
  const { isResponder } = useAuth();
  const theme = useRoleTheme();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.classList.remove('theme-police', 'theme-firefighter', 'theme-medic');
      document.body.classList.add(theme.themeClass);
    }
  }, [theme.themeClass]);

  if (!isResponder) {
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
        <Drawer.Screen name="index" options={{ title: 'Map', drawerLabel: 'Map' }} />
        <Drawer.Screen name="reports" options={{ title: 'Reports', drawerLabel: 'Reports' }} />
        <Drawer.Screen name="explore" options={{ title: 'Messages', drawerLabel: 'Messages' }} />
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