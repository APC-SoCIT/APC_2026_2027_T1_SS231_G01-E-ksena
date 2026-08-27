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

export interface RegisterResponse {
  success: boolean;
  message: string;
}

export interface VerifyResponse {
  success: boolean;
  message: string;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message || 'Login failed');
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

export const register = async (
  name: string, 
  email: string, 
  password: string, 
  phone: string, 
  dateOfBirth: string
): Promise<RegisterResponse> => {
  // Sign up the user (this creates auth.users row)
  // Supabase will send a confirmation email with OTP code
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { 
        name, 
        phone, 
        dateOfBirth,
        full_name: name, // Also store as full_name for consistency
        user_phone_number: phone
      },
      // Don't set emailRedirectTo - we want OTP code, not link
    },
  });

  if (signUpError) {
    throw new Error(signUpError.message);
  }

  if (!signUpData.user) {
    throw new Error('Failed to create user account');
  }

  // The database trigger will automatically create a row in public.users
  // Supabase sends the OTP code via email automatically after signUp
  // Note: You need to configure Supabase email template to send 6-digit code
  // See SETUP_OUTSIDE_CURSOR.md for instructions

  return {
    success: true,
    message: 'Registration successful. A 6-digit verification code has been sent to your email.',
  };
};

export const resendVerificationCode = async (email: string): Promise<{ success: boolean; message: string }> => {
  // Resend the confirmation email with OTP code
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: true,
    message: 'A new 6-digit verification code has been sent to your email.',
  };
};

export const verifyAccount = async (email: string, code: string): Promise<VerifyResponse> => {
  // Verify the OTP code (6-digit code from email)
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'signup', // Use 'signup' type for email verification after registration
  });

  if (error) {
    throw new Error(error.message || 'Invalid verification code. Please check the 6-digit code and try again.');
  }

  if (!data.user) {
    throw new Error('Verification failed. Please try again.');
  }

  // Update public.users table to mark email as verified
  // The trigger should handle this automatically, but we update explicitly to be sure
  const { error: updateError } = await supabase
    .from('users')
    .update({ email_verified: true })
    .eq('auth_user_id', data.user.id);

  if (updateError) {
    console.warn('Failed to update email_verified in public.users:', updateError);
    // Don't throw - verification was successful in auth, just DB sync issue
  }

  return {
    success: true,
    message: 'Email verified successfully! You can now log in.',
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

