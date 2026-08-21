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

export async function signOutResponder(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}