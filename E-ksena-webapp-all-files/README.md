# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Set up environment variables

   Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Where to get it |
   | --- | --- |
   | `EXPO_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same page — the **anon / publishable** key, never `service_role` |
   | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials |

   The Google Maps key needs **Maps JavaScript API**, **Directions API**, and
   **Geocoding API** all enabled, and the key itself restricted to those three
   APIs. Without Directions the road navigation silently fails to draw.

   The app refuses to start if any of these is missing, and tells you which one.

   > **These are not secrets.** The `EXPO_PUBLIC_` prefix means Expo bakes the
   > values into the browser bundle, where anyone can read them. That is fine for
   > a Supabase anon key (Row Level Security is what actually protects the data)
   > and for a restricted Maps key. Never put a Supabase `service_role` key or
   > any real secret in an `EXPO_PUBLIC_` variable.

3. Start the app

   ```bash
   npx expo start
   ```

   If you change a value in `.env`, restart with `npx expo start --web --clear`.
   Expo inlines these at build time, so a plain restart keeps serving the old
   values out of Metro's cache.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Deploy & preview the website

### 1. Preview locally (see your changes in the browser)

Build the static site, then serve it:

```bash
npm run build:web
npx serve dist
```

Open **http://localhost:3000** (or the URL shown in the terminal) to view the site.

After you make changes, run `npm run build:web` again, then refresh the browser.

### 2. Deploy to the internet (Vercel – free)

1. Create a free account at [vercel.com](https://vercel.com).
2. Install Vercel CLI: `npm i -g vercel` (or use `npx vercel`).
3. From the project folder run:
   ```bash
   npm run build:web
   npx vercel
   ```
4. Follow the prompts (link to your Vercel account if asked). Vercel will use the existing `vercel.json` (build command and `dist` output).
5. **Add the environment variables.** In the Vercel dashboard go to
   Project Settings → Environment Variables and add all three variables from
   `.env.example` (same names, same values). `.env` is gitignored, so Vercel
   cannot see it — without this step the deployed site fails to start.
   After adding them, redeploy so the new values get built in.
6. You’ll get a live URL like `https://e-ksena-xxx.vercel.app`.
7. Once you have the real domain, go back to Google Cloud Console and add an
   **HTTP referrer** restriction on the Maps key limiting it to that domain, so
   the key cannot be reused from anywhere else.

To deploy again after changes: run `npm run build:web`, then `npx vercel --prod` for production.

### 3. Deploy with Expo EAS Hosting

If you use an Expo account:

```bash
npm run build:web
npx eas deploy
```

Use `npx eas deploy --prod` for a production URL. See [Expo Deploy](https://docs.expo.dev/deploy/web/).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
