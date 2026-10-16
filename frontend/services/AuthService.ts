import { supabase } from './supabaseClient';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  token: string;
}

export const loginWithEmailOtp = async (email: string): Promise<{ success: boolean; message: string }> => {
  // Developer Bypass for testing without hitting rate limits
  if (email.toLowerCase() === 'test@test.com') {
    return {
      success: true,
      message: 'OTP sent successfully! (Bypassed: Use code 000000)',
    };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: true,
    message: 'OTP sent successfully! Please check your email.',
  };
};

import AsyncStorage from '@react-native-async-storage/async-storage';

const MOCK_SESSION_KEY = '@eksena_mock_session';

export const verifyEmailOtp = async (email: string, token: string, fullName?: string): Promise<LoginResponse> => {
  // Developer Bypass for testing
  if (email.toLowerCase() === 'test@test.com' && token === '000000') {
    const mockResponse: LoginResponse = {
      success: true,
      user: {
        id: 'developer-test-uuid',
        name: fullName?.trim() || 'Developer Test',
        email: 'test@test.com',
        phone: undefined,
      },
      token: 'mock-jwt-token-for-testing',
    };
    await AsyncStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(mockResponse));
    return mockResponse;
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message || 'Invalid OTP code.');
  }

  // Clear any existing mock session if real session succeeded
  await AsyncStorage.removeItem(MOCK_SESSION_KEY).catch(() => {});

  let u = data.user;

  // If user provided a full name, update auth metadata and users table
  if (fullName && fullName.trim()) {
    try {
      const { data: updatedAuth } = await supabase.auth.updateUser({
        data: { name: fullName.trim() }
      });
      if (updatedAuth?.user) {
        u = updatedAuth.user;
      }
      await supabase.from('users').update({ full_name: fullName.trim() }).eq('email', email);
    } catch (metaErr) {
      console.warn('[AuthService] Could not update fullName metadata:', metaErr);
    }
  }

  let resolvedName = (u.user_metadata as any)?.name || (fullName?.trim() ? fullName.trim() : '');
  let resolvedPhone = (u.user_metadata as any)?.phone;

  // 1. Try querying backend /api/user/profile using the session token (bypasses RLS)
  try {
    const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://eksena-backend.onrender.com/api';
    const profileRes = await fetch(`${apiBase}/user/profile`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` }
    });
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      if (profileData.success && profileData.user) {
        if (profileData.user.phone) resolvedPhone = profileData.user.phone;
        if (profileData.user.name && !resolvedName) resolvedName = profileData.user.name;
      }
    }
  } catch (apiErr) {
    console.warn('[AuthService] Could not fetch profile from backend:', apiErr);
  }

  // 2. Fallback: sync from users table using auth_user_id or email
  if (!resolvedPhone) {
    try {
      const { data: dbUser } = await supabase
        .from('users')
        .select('full_name, user_phone_number')
        .or(`auth_user_id.eq.${u.id},email.eq.${email}`)
        .maybeSingle();

      if (dbUser) {
        if (!resolvedName && dbUser.full_name) resolvedName = dbUser.full_name;
        if (!resolvedPhone && dbUser.user_phone_number && dbUser.user_phone_number !== 'unknown') {
          resolvedPhone = dbUser.user_phone_number;
        }
      }
    } catch (dbErr) {
      console.warn('[AuthService] Could not query users table:', dbErr);
    }
  }

  return {
    success: true,
    user: {
      id: u.id,
      name: resolvedName || '',
      email: (u.email as string) || email,
      phone: resolvedPhone,
      dateOfBirth: (u.user_metadata as any)?.dateOfBirth,
    },
    token: data.session.access_token,
  };
};

export const logout = async (): Promise<void> => {
  await AsyncStorage.removeItem(MOCK_SESSION_KEY).catch(() => {});
  // Local scope removes the persisted device session without requiring the
  // auth server to be reachable (airplane mode/offline logout).
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    console.warn('[AuthService] Local sign-out reported an error:', error.message);
  }
};

export const getCurrentSession = async (): Promise<LoginResponse | null> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (!error && session && session.user) {
      const u = session.user;
      let resolvedName = (u.user_metadata as any)?.name || '';
      let resolvedPhone = (u.user_metadata as any)?.phone;

      // 1. Try querying backend /api/user/profile using the session token (bypasses RLS)
      try {
        const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://eksena-backend.onrender.com/api';
        const profileRes = await fetch(`${apiBase}/user/profile`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.success && profileData.user) {
            if (profileData.user.phone) resolvedPhone = profileData.user.phone;
            if (profileData.user.name && !resolvedName) resolvedName = profileData.user.name;
          }
        }
      } catch (apiErr) {
        console.warn('[AuthService] Could not fetch profile from backend in getCurrentSession:', apiErr);
      }

      // 2. Fallback: sync from users table using auth_user_id or email
      if (!resolvedPhone) {
        try {
          const { data: dbUser } = await supabase
            .from('users')
            .select('full_name, user_phone_number')
            .or(`auth_user_id.eq.${u.id}${u.email ? `,email.eq.${u.email}` : ''}`)
            .maybeSingle();

          if (dbUser) {
            if (!resolvedName && dbUser.full_name) resolvedName = dbUser.full_name;
            if (!resolvedPhone && dbUser.user_phone_number && dbUser.user_phone_number !== 'unknown') {
              resolvedPhone = dbUser.user_phone_number;
            }
          }
        } catch (dbErr) {
          console.warn('[AuthService] Error querying users table in getCurrentSession:', dbErr);
        }
      }

      return {
        success: true,
        user: {
          id: u.id,
          name: resolvedName,
          email: (u.email as string) || '',
          phone: resolvedPhone,
          dateOfBirth: (u.user_metadata as any)?.dateOfBirth,
        },
        token: session.access_token,
      };
    }

    // Check mock session if no Supabase session exists
    const mockStored = await AsyncStorage.getItem(MOCK_SESSION_KEY);
    if (mockStored) {
      return JSON.parse(mockStored) as LoginResponse;
    }

    return null;
  } catch (err) {
    console.warn('[AuthService] Error getting current session:', err);
    return null;
  }
};

export const updateProfile = async (userId: string, updates: Partial<User>): Promise<User> => {
  const { data, error } = await supabase.auth.updateUser({
    data: updates,
  });

  if (error || !data.user) {
    throw new Error(error?.message || 'Failed to update profile');
  }

  const u = data.user;

  return {
    id: userId,
    name: (u.user_metadata as any)?.name || updates.name || '',
    email: u.email || updates.email || '',
    phone: (u.user_metadata as any)?.phone || updates.phone,
    dateOfBirth: (u.user_metadata as any)?.dateOfBirth || updates.dateOfBirth,
  };
};

