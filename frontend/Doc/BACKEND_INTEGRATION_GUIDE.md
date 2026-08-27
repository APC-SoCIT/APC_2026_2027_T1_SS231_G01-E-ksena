Backend & Integration Guide — Auth, Storage, Camera, Mapbox
===========================================================

This guide shows how to move from the current mostly‑mock setup to a more realistic stack:

- Use **Mapbox** for maps and (optionally) routing.
- Use **Supabase Auth** so users can register/login/logout with an email address (no more mock user).
- Upload **recorded videos** to a **Supabase Storage bucket** and store their URLs in the database.
- Add **flash/fill light** controls to the emergency camera.

You don’t need to do everything at once. A good order is:
1. Mapbox on the frontend (maps/routes look better).
2. Real auth with Supabase (real users).
3. Video upload to Supabase Storage.
4. Camera flash / fill light quality.

----------------------------------------------------------------------
1. Mapbox (replace or augment react-native-maps)
----------------------------------------------------------------------

Today `HomeScreen.tsx` uses `react-native-maps`. To switch to Mapbox:

1. **Create a Mapbox account and access token**
   - Go to `https://account.mapbox.com/`, create an account.
   - Create a public access token (scoped for maps).

2. **Install Mapbox for React Native**
   - From the `E-ksena_Mobile_1st` folder:
     - `npm install @rnmapbox/maps`
   - Follow the Mapbox RN docs for Expo (if you keep Expo managed workflow, you may need a config plugin or prebuild; check their latest instructions).

3. **Set the token once in app startup**
   - Create a small helper (e.g. `services/mapbox.ts`) and call:
     - `MapboxGL.setAccessToken('<YOUR_MAPBOX_ACCESS_TOKEN>');`
   - Or set the token from `app.json` (`extra.MAPBOX_TOKEN`) to avoid hard‑coding.

4. **Update HomeScreen to use Mapbox instead of react-native-maps**
   - Replace:
     - `import MapView, { Marker, Polyline } from 'react-native-maps';`
   - With:
     - `import MapboxGL from '@rnmapbox/maps';`
   - Conceptual JSX:
     - `<MapboxGL.MapView>` instead of `<MapView>`.
     - `<MapboxGL.Camera>` configured with `centerCoordinate` and `zoomLevel`.
     - `<MapboxGL.PointAnnotation>` (or `SymbolLayer`) instead of `Marker` for:
       - User location.
       - Responder location.
       - Optional base/station.
     - `<MapboxGL.ShapeSource>` + `<MapboxGL.LineLayer>` instead of `Polyline` to draw the line between user and responder.

5. (Optional but powerful) **Use Mapbox Directions API for fastest route**
   - Backend (or mobile app) calls Mapbox Directions:
     - Origin = responder base lat/lng.
     - Destination = incident lat/lng.
   - Response contains:
     - Geometry (polyline) — to draw the exact driving route.
     - Distance/Duration — more accurate ETA than a simple Haversine approximation.
   - You can:
     - Store the route/ETA in the incident payload; or
     - Request directions directly from the mobile app as soon as it knows both coordinates.

With this in place, the rest of the pipeline (backend → Supabase → incident coordinates) stays the same, only the map rendering layer changes.

----------------------------------------------------------------------
2. Real user auth with Supabase (email/password)
----------------------------------------------------------------------

Right now `AuthContext` + `AuthService.ts` use mock logic. To switch to real email/password auth:

2.1. Configure Supabase Auth
----------------------------

- In Supabase dashboard:
  - Go to **Authentication → Providers**.
  - Make sure **Email** is enabled.
  - In **Settings → API**:
    - Copy `Project URL` (e.g. `https://xxxx.supabase.co`).
    - Copy the **anon public key** (NOT the service key).

2.2. Add a Supabase client for the mobile app
---------------------------------------------

- Create `services/supabaseClient.ts` in `E-ksena_Mobile_1st`:

```ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const SUPABASE_URL =
  (Constants.expoConfig as any)?.extra?.SUPABASE_URL as string;
const SUPABASE_ANON_KEY =
  (Constants.expoConfig as any)?.extra?.SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- In `app.json` add:

```json
"extra": {
  "API_BASE_URL": "http://YOUR_IP:3000/api",
  "SUPABASE_URL": "https://your-project-id.supabase.co",
  "SUPABASE_ANON_KEY": "your-public-anon-key"
}
```

2.3. Replace mock AuthService with Supabase calls
------------------------------------------------

- In `services/AuthService.ts`, replace the mock implementations with real ones using the `supabase` client:

- **Register**
  - Use `supabase.auth.signUp({ email, password, options: { data: { name, phone, dateOfBirth } } })`.
  - On success, show a message like “Check your email to confirm your account”.

- **Login**
  - Use `supabase.auth.signInWithPassword({ email, password })`.
  - On success, return:
    - `user` built from `data.user` and `data.user.user_metadata`.
    - `token` from `data.session.access_token`.

- **Logout**
  - Use `supabase.auth.signOut()` and clear local auth state.

2.4. Wire into AuthContext
--------------------------

- Update `login` in `context/AuthContext.tsx` to:
  - Dispatch `LOGIN_START`.
  - Call `AuthService.login(email, password)`.
  - On success, dispatch `LOGIN_SUCCESS` with the real user + token.
  - On error, dispatch `LOGIN_FAILURE` with the error message.

- Update `logout` to:
  - Call `AuthService.logout()`.
  - Dispatch `LOGOUT`.

After that, the rest of the app (navigation, screens) can keep using `useAuth()` as before, but auth is now backed by real Supabase user accounts.

----------------------------------------------------------------------
3. Upload recorded videos to Supabase Storage
----------------------------------------------------------------------

Right now the app sends a placeholder video URL (`mock://video`) to the backend. To upload real videos:

3.1. Create a Storage bucket
----------------------------

- In Supabase dashboard:
  - Go to **Storage → New bucket**.
  - Name it e.g. `incident-videos`.
  - For a simple demo, you can keep it **public**; for production prefer private + signed URLs.

3.2. Add a helper to upload a video from the app
-----------------------------------------------

- In `services` (mobile app), create e.g. `videoUpload.ts`:

```ts
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabaseClient';

export const uploadIncidentVideo = async (
  fileUri: string,
  userId: string
): Promise<string> => {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const filePath = `${userId}/${Date.now()}.mp4`;

  const { error } = await supabase.storage
    .from('incident-videos')
    .upload(filePath, Buffer.from(base64, 'base64'), {
      contentType: 'video/mp4',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from('incident-videos')
    .getPublicUrl(filePath);

  return data.publicUrl; // send this to backend as video_url
};
```

3.3. Use the real video URL when sending the report
---------------------------------------------------

- In `VideoCameraScreen.tsx`:
  - After you have the real `videoUri` from `expo-camera` recording:
    - Call `uploadIncidentVideo(videoUri, state.auth.user?.id || 'anonymous')`.
    - Pass the returned URL into `sendVideoReport` instead of the placeholder.

- In `sendVideoReport` (in `ReportService.ts`), change the payload:
  - From hard‑coded `'mock://video'` to the real `videoUrl` argument.

- Backend `server.js` already stores `video_url` in `public.incidents`, so no schema change is needed; you just pass a real URL instead of a fake one.

----------------------------------------------------------------------
4. Add flash / fill light to the camera
----------------------------------------------------------------------

`VideoCameraScreen.tsx` already uses `CameraView` from `expo-camera`. To add flash:

4.1. Add flash state
--------------------

- In `VideoCameraScreen.tsx`:
  - Add: `const [flash, setFlash] = useState<'off' | 'on'>('off');`

4.2. Pass flash prop into CameraView
------------------------------------

- Update the JSX:

```tsx
<CameraView
  ref={cameraRef}
  style={styles.camera}
  facing={cameraType}
  flash={flash}
>
  {/* overlays remain the same */}
</CameraView>
```

4.3. Add a toggle button in the UI
----------------------------------

- Add a handler:

```ts
const toggleFlash = () => {
  setFlash(prev => (prev === 'off' ? 'on' : 'off'));
};
```

- Reuse one of the existing header buttons (or add a new icon) to call `toggleFlash`. For example, next to the flip‑camera button.

When `flash` is `on`, supported devices will keep the torch/flash active during recording, acting as a fill light in low‑light emergencies.

----------------------------------------------------------------------
Summary
----------------------------------------------------------------------

- **Mapbox**: replace `react-native-maps` with Mapbox so the same coordinates from your backend can render nicer tiles and (optionally) true driving routes.
- **Supabase Auth**: swap the mock `AuthService` for real email/password auth using `supabase.auth`, and wire it through `AuthContext`.
- **Video Storage**: upload real recordings from the app to a Supabase Storage bucket and store the public URL in `public.incidents.video_url`.
- **Camera flash**: add a small `flash` state and prop to `CameraView` plus a UI toggle so users can light the scene while recording.

All of these changes build on top of the architecture already documented in `ARCHITECTURE.md` and the existing Node/Supabase backend, so you can introduce them one by one without breaking the current working flow.


