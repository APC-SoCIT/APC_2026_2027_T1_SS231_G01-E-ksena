import { supabase } from '@/lib/supabase';
import type { RoleThemeKey } from '@/constants/theme';

const SERVICE_TYPE_BY_ROLE: Record<RoleThemeKey, 'fire' | 'medical' | 'police'> = {
  firefighter: 'fire',
  medic: 'medical',
  police: 'police',
};

export type ResponderSignupInput = {
  email: string;
  password: string;
  username: string;
  role: RoleThemeKey;
  fullName: string;
  phone: string;
  rank?: string;
  office?: string;
  stationAddress?: string;
};

export async function signUpResponder(input: ResponderSignupInput): Promise<{ needsVerification: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        username: input.username,
        role: input.role,
        full_name: input.fullName,
        phone: input.phone,
        rank: input.rank ?? null,
        office: input.office ?? null,
        station_address: input.stationAddress ?? null,
      },
    },
  });
  if (error) throw error;

  return { needsVerification: !data.session };
}

async function upsertResponderRecord(user: NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']>) {
  const meta = user.user_metadata as Record<string, unknown>;
  const role = meta.role as RoleThemeKey | undefined;
  const { error } = await supabase.from('responders').upsert(
    {
      auth_user_id: user.id,
      name: (meta.full_name as string) ?? null,
      rank: (meta.rank as string) ?? null,
      office: (meta.office as string) ?? null,
      responder_phone_number: (meta.phone as string) ?? null,
      service_type: role ? SERVICE_TYPE_BY_ROLE[role] : 'police',
      station_address: (meta.station_address as string) ?? null,
    },
    { onConflict: 'auth_user_id' }
  );
  if (error) throw error;
}

/**
 * Pushes the signed-in account's metadata into the responders directory.
 * Profile edits only change auth metadata, which dispatch never reads -- without
 * this the directory keeps whatever name and number were given at sign-up.
 */
export async function syncResponderRecord(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (data.user) await upsertResponderRecord(data.user);
}

export async function verifySignupOtp(email: string, code: string): Promise<void> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
  if (error) throw error;
  if (data.user) await upsertResponderRecord(data.user);
}

export async function resendSignupOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

export async function signInResponder(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await upsertResponderRecord(data.user);
}

/**
 * The page Supabase sends a recovery link back to. It must also be listed under
 * Authentication > URL Configuration in the Supabase dashboard, or the link is
 * rejected and the responder lands on the site root with no session.
 */
function passwordResetRedirect(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/reset-password`;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirect(),
  });
  if (error) throw error;
}

/**
 * Sets a new password using the short-lived session the recovery link creates.
 * No current password is asked for here - possession of the emailed link is the
 * proof, which is why that link has to stay single-use and short-lived.
 */
export async function completePasswordReset(newPassword: string): Promise<void> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) {
    throw new Error('This reset link has expired or has already been used. Request a new one.');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const email = data.user?.email;
  if (!email) throw new Error('No signed-in account was found.');

  // Re-authenticate first. updateUser alone would let anyone with an unlocked
  // session set a new password without knowing the old one.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (reauthError) throw new Error('Your current password is incorrect.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOutResponder(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}