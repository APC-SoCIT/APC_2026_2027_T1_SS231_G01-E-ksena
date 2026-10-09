import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

// supabase-js consumes the auth fragment the moment the client is created, so
// snapshot the URL before that happens. The recovery screen needs it to tell a
// real recovery link apart from a responder who simply had a session already.
export const INITIAL_URL_HASH = typeof window === 'undefined' ? '' : window.location.hash;
export const INITIAL_URL_SEARCH = typeof window === 'undefined' ? '' : window.location.search;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
