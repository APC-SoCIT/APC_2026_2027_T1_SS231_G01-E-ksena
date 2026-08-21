import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { signOutResponder } from '@/lib/auth-service';
import type { RoleThemeKey } from '@/constants/theme';

export type ResponderUser = {
  role: RoleThemeKey;
  username: string;
  email?: string;
};

type AuthContextValue = {
  isResponder: boolean;
  user: ResponderUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<ResponderUser, 'username'>>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromSession(session: Session | null): ResponderUser | null {
  if (!session?.user) return null;
  const meta = session.user.user_metadata as Record<string, unknown>;
  const role = meta.role as RoleThemeKey | undefined;
  if (!role) return null;
  return {
    role,
    username: (meta.username as string) ?? session.user.email ?? 'Responder',
    email: session.user.email,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });
    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const user = userFromSession(session);

  const logout = async () => {
    await signOutResponder();
  };

  const updateProfile = async (updates: Partial<Pick<ResponderUser, 'username'>>) => {
    const { error } = await supabase.auth.updateUser({ data: { ...updates } });
    if (error) throw error;
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  };

  return (
    <AuthContext.Provider
      value={{
        isResponder: !!user,
        user,
        loading,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}