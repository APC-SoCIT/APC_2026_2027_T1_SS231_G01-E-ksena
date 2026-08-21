import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://cwhduwianpugjbnqzmhs.supabase.co';
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ?? 'sb_publishable_oaawhfNpHS5iLqjIVTxxsg_VO9_Zwxv';

export const supabase = createClient(supabaseUrl, supabaseKey);