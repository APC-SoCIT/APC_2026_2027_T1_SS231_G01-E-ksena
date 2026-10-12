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

export const verifyEmailOtp = async (email: string, token: string): Promise<LoginResponse> => {
  // Developer Bypass for testing
  if (email.toLowerCase() === 'test@test.com' && token === '000000') {
    const mockResponse: LoginResponse = {
      success: true,
      user: {
        id: 'developer-test-uuid',
        name: 'Developer Test',
        email: 'test@test.com',
        phone: '+639123456789',
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

  const u = data.user;

  return {
    success: true,
    user: {
      id: u.id,
      name: (u.user_metadata as any)?.name || (u.email as string),
      email: (u.email as string) || email,
      phone: (u.user_metadata as any)?.phone,
      dateOfBirth: (u.user_metadata as any)?.dateOfBirth,
    },
    token: data.session.access_token,
  };
};

export const logout = async (): Promise<void> => {
  await AsyncStorage.removeItem(MOCK_SESSION_KEY).catch(() => {});
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
};

export const getCurrentSession = async (): Promise<LoginResponse | null> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (!error && session && session.user) {
      const u = session.user;
      return {
        success: true,
        user: {
          id: u.id,
          name: (u.user_metadata as any)?.name || (u.email as string),
          email: (u.email as string) || '',
          phone: (u.user_metadata as any)?.phone,
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

