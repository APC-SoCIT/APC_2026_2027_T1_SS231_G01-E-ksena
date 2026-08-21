import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/context/auth';
import { getRoleTheme, type RoleThemeKey, type RoleThemeColors } from '@/constants/theme';

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
  const { user } = useAuth();
  const roleKey = user?.role as RoleThemeKey | undefined;
  const theme = getRoleTheme(roleKey);
  const themeClass = roleToThemeClass(roleKey);

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