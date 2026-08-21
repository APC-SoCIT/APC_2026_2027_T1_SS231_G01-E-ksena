import { View, Text, StyleSheet, Platform } from 'react-native';
import { useRoleTheme } from '@/context/role-theme';
import { FontSizes, Radius } from '@/constants/theme';

export function RoleBadge() {
  const theme = useRoleTheme();

  return (
    <View style={styles.badge}>
      <Text style={styles.label} numberOfLines={1}>
        {theme.displayName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    marginRight: Platform.OS === 'web' ? 12 : 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  label: {
    color: '#fff',
    fontSize: FontSizes.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});