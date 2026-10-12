import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { isResponderRole, signOutResponder, syncResponderRecord } from '@/lib/auth-service';
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
  /**
   * An admin whose account belongs to no service. It reaches the Admin page
   * and its own account page, and none of the screens a responder works from.
   */
  isAdminOnly: boolean;
  /** The signed-in account's email. Set even when `user` is null, as it is for an admin-only account. */
  accountEmail: string | null;
  user: ResponderUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromSession(session: Session | null): ResponderUser | null {
  if (!session?.user) return null;
  const meta = session.user.user_metadata as Record<string, unknown>;
  const role = meta.role;
  // Only the three services make a responder. Anything else in that field is
  // treated like nothing at all, so no other value can open the dashboard.
  if (!isResponderRole(role)) return null;
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
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setSessionLoading(false);
    });
    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const user = userFromSession(session);
  const uid = session?.user?.id ?? null;

  // The answer is kept together with the account it is about. A bare true or
  // false would still be on hand when a different account signs in, and for a
  // moment the new account would be judged by the last one's answer.
  const [adminCheck, setAdminCheck] = useState<{ uid: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    supabase
      .from('admins')
      .select('auth_user_id')
      .eq('auth_user_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAdminCheck({ uid, isAdmin: !!data });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const adminKnown = !uid || adminCheck?.uid === uid;
  const isAdmin = !!uid && adminCheck?.uid === uid && adminCheck.isAdmin;
  const isAdminOnly = isAdmin && !user;

  // The first screen waits for the admin answer as well as the session, because
  // which screens exist depends on both: drawn a moment early, an admin-only
  // account would be shown the login page while already signed in. That wait
  // happens once. After it, a login changes the screens in place - taking the
  // whole app down to a spinner in the middle of one would throw away the
  // login screen along with whatever it was about to say.
  const settled = !sessionLoading && adminKnown;
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (settled) setBooted(true);
  }, [settled]);
  const loading = !booted && !settled;

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
        isAdminOnly,
        accountEmail: session?.user?.email ?? null,
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