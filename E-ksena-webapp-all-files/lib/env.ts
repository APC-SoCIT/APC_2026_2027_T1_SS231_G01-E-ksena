const REQUIRED_VARS = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
};

const missing = Object.entries(REQUIRED_VARS)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.\n\n` +
      'Local development: copy .env.example to .env, fill in the values, then restart the dev server ' +
      'with "npx expo start --web --clear" so the new values are picked up.\n' +
      'Vercel: add them under Project Settings > Environment Variables and redeploy.'
  );
}

export const SUPABASE_URL = REQUIRED_VARS.EXPO_PUBLIC_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = REQUIRED_VARS.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
export const GOOGLE_MAPS_API_KEY = REQUIRED_VARS.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string;
