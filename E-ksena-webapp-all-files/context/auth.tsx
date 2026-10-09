import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { signOutResponder, syncResponderRecord } from '@/lib/auth-service';
import type { RoleThemeKey } from '@/constants/theme';

export type ResponderUser = {
  role: RoleThemeKey;
  username: string;
  email?: string;
  fullName?: string;
  phone?: string;
};

export type ProfileUpdate = Partial<Pick<ResponderUser, 'username' | 'fullName' | 'phone'>>;

type AuthContextValue = {
  isResponder: boolean;
  /**
   * True when this account appears in the `admins` table. Deliberately not read
   * from user_metadata: sign-up metadata is client-supplied, so an account could
   * otherwise claim to be an admin. Defaults to false if the table is missing.
   */
  isAdmin: boolean;
  user: ResponderUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<void>;
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
    fullName: (meta.full_name as string) ?? undefined,
    phone: (meta.phone as string) ?? undefined,
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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('admins')
      .select('auth_user_id')
      .eq('auth_user_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const logout = async () => {
    await signOutResponder();
    setSession(null);
  };

  const updateProfile = async (updates: ProfileUpdate) => {
    // Auth metadata and the responders table spell these differently, so map
    // the keys rather than spreading the camelCase ones straight through.
    const meta: Record<string, string> = {};
    if (updates.username !== undefined) meta.username = updates.username;
    if (updates.fullName !== undefined) meta.full_name = updates.fullName;
    if (updates.phone !== undefined) meta.phone = updates.phone;

    const { error } = await supabase.auth.updateUser({ data: meta });
    if (error) throw error;
    await syncResponderRecord();
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  };

  return (
    <AuthContext.Provider
      value={{
        isResponder: !!user,
        isAdmin,
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