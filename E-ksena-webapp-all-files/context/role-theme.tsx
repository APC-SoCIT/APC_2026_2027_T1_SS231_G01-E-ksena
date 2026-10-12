import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/context/auth';
import { AdminTheme, getRoleTheme, type RoleThemeKey, type RoleThemeColors } from '@/constants/theme';

type RoleThemeContextValue = RoleThemeColors & {
  roleKey: RoleThemeKey | undefined;
  themeClass: string;
};

const RoleThemeContext = createContext<RoleThemeContextValue | null>(null);

function roleToThemeClass(role: RoleThemeKey | undefined): string {
  if (role === 'police') return 'theme-police';
  if (role === 'firefighter') return 'theme-firefighter';
  if (role === 'medic') return 'theme-medic';
  return 'theme-firefighter';
}

export function RoleThemeProvider({ children }: { children: ReactNode }) {
  const { user, isAdminOnly } = useAuth();
  const roleKey = user?.role as RoleThemeKey | undefined;
  // An admin with no service gets colours and a label of its own. Left to the
  // fallback it would be dressed, and badged, as a firefighter.
  const theme = isAdminOnly ? AdminTheme : getRoleTheme(roleKey);
  const themeClass = isAdminOnly ? 'theme-admin' : roleToThemeClass(roleKey);

  const value = useMemo<RoleThemeContextValue>(
    () => ({
      ...theme,
      roleKey,
      themeClass,
    }),
    [theme, roleKey, themeClass]
  );

  return (
    <RoleThemeContext.Provider value={value}>
      {children}
    </RoleThemeContext.Provider>
  );
}

export function useRoleTheme(): RoleThemeContextValue {
  const ctx = useContext(RoleThemeContext);
  if (!ctx) {
    return {
      ...getRoleTheme(undefined),
      roleKey: undefined,
      themeClass: 'theme-firefighter',
    };
  }
  return ctx;
}