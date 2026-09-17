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

export const verifyEmailOtp = async (email: string, token: string): Promise<LoginResponse> => {
  // Developer Bypass for testing
  if (email.toLowerCase() === 'test@test.com' && token === '000000') {
    return {
      success: true,
      user: {
        id: 'developer-test-uuid',
        name: 'Developer Test',
        email: 'test@test.com',
        phone: '+639123456789',
      },
      token: 'mock-jwt-token-for-testing',
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message || 'Invalid OTP code.');
  }

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
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
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

