import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const SUPABASE_URL = (Constants.expoConfig as any)?.extra?.SUPABASE_URL as string;
const SUPABASE_ANON_KEY = (Constants.expoConfig as any)?.extra?.SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


