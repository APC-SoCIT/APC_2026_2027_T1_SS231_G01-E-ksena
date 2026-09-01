E-KSENA Setup Guide (Outside Cursor)
====================================

This file explains what you need to do **outside Cursor** (in your browser, Supabase dashboard, and terminal) so the updated frontend and backend work correctly with:

- Real email/password login (Supabase Auth)
- Video uploads to Supabase Storage
- Dispatch + incidents in the database
- Mapbox maps

Follow these steps in order.

--------------------------------------------------
1. Supabase project and database
--------------------------------------------------

1. Go to `https://app.supabase.com` and open (or create) your project.
2. In the left menu, click **SQL** → **New query**.
3. Open this file in your editor:
   - `Mobile-App/backend/database.md`
4. Copy **all** of its content into the Supabase SQL editor.
5. Click **Run**.
6. When it finishes, check **Table editor** and confirm you see:
   - `users`
   - `responders`
   - `incidents`
   - `ai_analysis`
   - `dispatch`

These tables will now be used by the backend and the app.

--------------------------------------------------
2. Supabase Auth (email login / logout)
--------------------------------------------------

1. In the Supabase dashboard, click **Authentication → Providers**.
2. Make sure **Email** is turned **ON**.
3. Click **Settings → API** and copy:
   - `Project URL` (looks like `https://xxxx.supabase.co`).
   - The **anon public key** (this is safe to use in the mobile app).
4. Open `Mobile-App/frontend/app.json` in your code editor.
5. Find the `"extra"` section and replace the placeholders:

   - `"SUPABASE_URL": "https://YOUR-PROJECT-ID.supabase.co"`  
     → put your real project URL here.
   - `"SUPABASE_ANON_KEY": "YOUR-SUPABASE-ANON-KEY"`  
     → paste your anon key here.

The frontend is already wired to use these values for real email/password auth.

--------------------------------------------------
2a. Configure 6-Digit OTP Email Verification
--------------------------------------------------

To enable 6-digit code verification (instead of email links):

1. In Supabase dashboard, go to **Authentication → Email Templates**.
2. Find the **"Confirm signup"** template.
3. Click **Edit** and replace the template with this:

   **Subject:** `Verify your E-KSENA account - Code: {{ .Token }}`

   **Body (HTML):**
   ```html
   <h2>Welcome to E-KSENA!</h2>
   <p>Your verification code is:</p>
   <h1 style="font-size: 32px; letter-spacing: 8px; color: #dc2626;">{{ .Token }}</h1>
   <p>Enter this 6-digit code in the app to verify your email address.</p>
   <p>This code will expire in 1 hour.</p>
   ```

   **Note:** `{{ .Token }}` is automatically replaced with the 6-digit OTP code.

4. Click **Save**.

**Alternative:** If you want to customize further, you can use:
   - `{{ .Token }}` - The 6-digit OTP code
   - `{{ .SiteURL }}` - Your site URL
   - `{{ .Email }}` - User's email address

Now when users register, they'll receive a 6-digit code via email instead of a confirmation link.

--------------------------------------------------
3. Supabase Storage (video bucket)
--------------------------------------------------

1. In the Supabase dashboard, click **Storage**.
2. Click **“New bucket”**.
3. Name it `incident-videos`.
4. For easy testing, you can mark it as **Public** (later you can switch to private and signed URLs).
5. Click **Create**.

The mobile app code will now upload recorded videos to this bucket and store a public URL in the `incidents.video_url` column.

--------------------------------------------------
4. Mapbox account and token
--------------------------------------------------

1. Go to `https://account.mapbox.com/` and sign up / log in.
2. Create a **public access token** (read-only is enough for maps).
3. Copy the token.
4. Open `Mobile-App/frontend/app.json` again.
5. In the `"extra"` block, replace:
   - `"MAPBOX_TOKEN": "YOUR-MAPBOX-PUBLIC-TOKEN"`  
     → paste your real Mapbox token.

The frontend is already set up to call `MapboxGL.setAccessToken()` with this token and use Mapbox in `HomeScreen`.

--------------------------------------------------
5. Install npm dependencies
--------------------------------------------------

Open a terminal (PowerShell or Command Prompt) and run the following commands from the **Mobile-App** directory.

### 5.1 Backend dependencies

```bash
cd "ver 12-23-mobile/APC_2025_2026_T1_SS231_G06-Eksena-Mobile-app/Mobile-App/backend"
npm install
```

### 5.2 Frontend dependencies

```bash
cd "ver 12-23-mobile/APC_2025_2026_T1_SS231_G06-Eksena-Mobile-app/Mobile-App/frontend"
npm install

# If not already installed, add Supabase and Mapbox:
npm install @supabase/supabase-js @rnmapbox/maps
```

> Note: Mapbox may require additional setup depending on your Expo / React Native version. Follow the `@rnmapbox/maps` documentation if the build asks for extra steps (such as a config plugin or prebuild).

--------------------------------------------------
6. Backend environment file
--------------------------------------------------

1. In `Mobile-App/backend`, create a file named `.env` (if it doesn’t exist).
2. Add the following lines (replace with your real values):

```bash
SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
PORT=3000
```

- The **service role key** is found in Supabase under **Settings → API** (`service_role` key).  
- **Do not** put this key into the frontend; it is for the backend only.

--------------------------------------------------
7. Start backend and frontend
--------------------------------------------------

### 7.1 Start the backend

```bash
cd "ver 12-23-mobile/APC_2025_2026_T1_SS231_G06-Eksena-Mobile-app/Mobile-App/backend"
npm start
```

You should see logs like:

- `E-KSENA Backend Server running on port 3000`
- `Health check: http://localhost:3000/health`

You can test it in a browser: open `http://localhost:3000/health` and you should get a small JSON response.

### 7.2 Start the frontend (mobile app)

```bash
cd "ver 12-23-mobile/APC_2025_2026_T1_SS231_G06-Eksena-Mobile-app/Mobile-App/frontend"
npm start
```

Then:

- Press `a` for Android emulator, or  
- Scan the QR code with Expo Go on your physical phone.

Make sure `API_BASE_URL` in `app.json` is correct:

- Android emulator: `http://10.0.2.2:3000/api`
- Real device: `http://YOUR-COMPUTER-IP:3000/api`

--------------------------------------------------
8. Test the full flow
--------------------------------------------------

1. **Create a user:**
   - Open the app.
   - Go to registration.
   - Enter name, email, password, phone, birth date.
   - Submit.
2. **Confirm email:**
   - Check your inbox for a Supabase confirmation email.
   - Click the confirmation link.
3. **Log in:**
   - Back in the app, log in with the same email/password.
4. **Send an incident:**
   - Allow location and camera permissions.
   - Go to the “E-ksena” / Video tab.
   - Start and stop a short emergency recording.
5. **What should happen:**
   - The app uploads the video to the `incident-videos` bucket.
   - The app calls `POST /api/report-incident` with location, phone, and `video_url`.
   - The backend inserts an incident row, then creates a dispatch and assigns a responder.
   - After a few seconds, the app fetches incident details.
   - The home screen shows:
     - Your location and the responder on a **Mapbox** map.
     - A line between you and the responder.
     - Distance and an approximate ETA.
6. **Confirm in Supabase:**
   - In **Table editor → incidents**, you should see a new row with:
     - `incident_location_lat` / `incident_location_lng`
     - `video_url` (a URL from the `incident-videos` bucket)
     - `created_at` timestamp
   - In **Table editor → dispatch**, check the `status` field (should be `'dispatched'`, `'in_progress'`, or `'resolved'`)
   - In **Table editor → dispatch**, you should see a row linking:
     - `incident_id` → your incident
     - `responder_id` → a responder

If these checks pass, your new architecture (incidents before AI, dispatches after AI, real auth, video storage, Mapbox) is working end-to-end.

---

## 9. Troubleshooting Network Issues

If you see **"Network request failed"** errors in the app:

### Check Backend is Running
```bash
cd backend
node server.js
```
You should see the server start message. If not, check your `.env` file has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

### Verify IP Address
1. **On Windows:** Open PowerShell and run:
   ```powershell
   ipconfig
   ```
   Look for your local IP (usually starts with `192.168.` or `10.`)

2. **Update `frontend/app.json`:**
   ```json
   "extra": {
     "API_BASE_URL": "http://YOUR_IP_HERE:3000/api"
   }
   ```

3. **Restart Expo:**
   ```bash
   cd frontend
   npm start
   ```
   Press `r` to reload, or restart completely.

### Test Connection Manually
1. Open a browser on your phone/emulator
2. Navigate to: `http://YOUR_IP:3000/health`
3. You should see: `{"status":"ok","timestamp":"...","service":"E-KSENA Backend API"}`

If this doesn't work:
- **Firewall:** Windows Firewall might be blocking port 3000. Allow Node.js through the firewall.
- **Network:** Make sure your phone and computer are on the same Wi-Fi network.
- **IP Changed:** Your IP might have changed. Run `ipconfig` again and update `app.json`.

### Keep-Awake Warning
If you see "Unable to activate keep awake" - this is **harmless**. It's just expo-camera trying to keep the screen on during recording. The camera will still work fine. This warning has been suppressed in the code.

### Common Issues

**"Cannot connect to backend server"**
- Backend not running → Start it with `node server.js`
- Wrong IP address → Update `app.json` with correct IP
- Firewall blocking → Allow Node.js through Windows Firewall

**"Supabase error"**
- Check `.env` file has correct `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Verify Supabase project is active
- Check database tables exist (run SQL from `database.md`)

**"Mapbox error"**
- Verify `MAPBOX_TOKEN` in `app.json` is correct
- Check token is not expired
- Ensure token has proper permissions


