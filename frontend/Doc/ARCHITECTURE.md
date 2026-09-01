Project Architecture — E-KSENA

This file describes the high-level structure of the repository and the purpose of the main files and folders so you (and future contributors) can quickly find and understand code.

Top-level files
- `App.tsx` — small bootstrap entry that re-exports `src/App.tsx` (keeps Expo's entry simple).
- `app.json` — Expo app configuration (permissions, plugins, icons, Android/iOS settings).
- `package.json` — project dependencies and scripts. Note: `main` is set to `expo-router/entry` to enable file-based routing.
- `tsconfig.json` — TypeScript configuration.
- `README.md` / `README_SRC.md` — project README and a short note about the `src` scaffold.
- `ARCHITECTURE.md` — this file.

Important folders
- `src/` — the recommended place to add application-level code. It contains small re-export helpers and `src/App.tsx`:
  - `src/App.tsx` — the main composition for the app: wraps your app in `SafeAreaProvider`, `AuthProvider`, and renders the app navigator.
  - `src/navigation/index.ts` — re-exports existing navigation stacks so other files can import from `src/navigation`.
  - `src/context/index.ts` — re-exports `AuthContext` provider and hooks.

- `navigation/` — the app's navigation stacks. These are the main navigators used by the app:
  - `AppNavigator.tsx` — returns the root stack (decides whether to show `AuthStack` or `MainStack` based on auth state). Note: this file should NOT render a `NavigationContainer` when using `expo-router` (we removed the nested container).
  - `AuthStack.tsx` — stack navigator for authentication flows (Login, Registration, Verification).
  - `MainStack.tsx` — main application stack. Contains a bottom tab navigator (`MainTabs`) and screens like `Chat` and `Calling`.

- `context/` — app-wide React contexts and state management:
  - `AuthContext.tsx` — a combined auth + location reducer with typed actions and helper functions (login/logout/setLocation). Exposes `useAuth` hook and `AuthProvider`.

- `screens/` — UI screens (grouped under `auth/` and `main/`):
  - `screens/LoadingScreen.tsx` — shown when app is checking authentication/loading state.
  - `screens/auth/*` — `LoginScreen.tsx`, `RegistrationScreen.tsx`, `VerificationScreen.tsx`.
  - `screens/main/*` — `HomeScreen.tsx`, `ChatScreen.tsx`, `CallingScreen.tsx`, `ProfileScreen.tsx`, `VideoCameraScreen.tsx`.

- `services/` — business logic / API wrappers and external service calls:
  - `AuthService.ts` — HTTP/auth interactions (login, token management) — currently mocked in the AuthContext.
  - `ReportService.ts` — service for sending reports to backend (used by main flow).

- `assets/` — images, icons, fonts.

How navigation works (quick summary)
- `expo-router` is installed and the `main` entry is `expo-router/entry`. This is file-based routing. To integrate your existing navigation stacks with expo-router we added `app/_layout.tsx` which delegates rendering to `src/App`.
- `src/App` composes `AuthProvider` and `AppNavigator`. `AppNavigator` returns a stack that either renders `AuthStack` or `MainStack` depending on auth state.
- `MainStack` includes a bottom tab navigator (Home / Emergency Video / Profile). The tab bar respects safe-area insets (so it doesn't overlap Android system nav bar).

Developer notes and recommended improvements
- Path aliases: consider adding `paths` in `tsconfig.json` (e.g. `@src/*`) so imports are shorter and consistent.
- Move navigation and context files into `src/` if you want a single source-of-truth directory (I created re-exports to allow incremental migration).
- Tests: add unit tests for `AuthContext` reducers and small UI tests for critical flows like login and emergency call.
- CI: add a lint and type-check step on push to catch syntax/import errors early.

If you want, I can:
- Move the `navigation/` and `context/` directories into `src/` and update imports project-wide.
- Add TypeScript path aliases and update import statements.
- Create a small diagram (SVG/PNG) showing the navigation flow.

If anything in this file looks inaccurate, paste the file or path you want documented and I'll update this doc.

Code inventory — files by role
-----------------------------

This project contains three logical layers. Below is a clear classification with file examples so you know which files live in the UI layer, which files are backend-facing wrappers, and which files are mock backends used for local development.

- UI (front-end mobile app code): these are the components, screens, navigation and contexts shown to the user.
  - `App.tsx` (root bootstrap)
  - `src/App.tsx` (app composition)
  - `navigation/*` (AppNavigator.tsx, AuthStack.tsx, MainStack.tsx)
  - `screens/*` (LoadingScreen.tsx, screens/auth/*, screens/main/*)
  - `context/AuthContext.tsx` (provides app state and hooks consumed by UI)
  - `assets/*` (icons, images used in UI)
  

- Backend (production API integration points): these modules are intended to call your real backend endpoints.
  - NOTE: In this repository both logical backend modules exist as mock implementations by default. When you replace mocks with real implementations, put them here.
  - Example file paths where real implementations would live:
    - `services/AuthService.ts` (should contain real HTTP calls to auth endpoints)
    - `services/ReportService.ts` (should contain real HTTP calls to create and manage incident reports)

- Mock-backend (development/test doubles): files that simulate server behaviour for local testing and UI development. These are safe to call in development and return deterministic mock data.
  - `services/AuthService.ts` — currently a mock implementation. Functions: `login`, `register`, `verifyAccount`, `logout`, `updateProfile`. They simulate latency and return mock users/tokens.
- `services/ReportService.ts` — currently a mock implementation. Functions: `sendVideoReport`, `sendSMSReport`, `getUserIncidents`, `updateIncidentStatus`. They return mock incidents and reports.

(3 videos that can be use for ai analyzing)How to swap mock-backend for a real backend
-------------------------------------------
1. Implement real API calls inside `services/AuthService.ts` and `services/ReportService.ts` (use fetch/axios and replace the mock logic). Keep the exported function signatures so `AuthContext` and screens don't need updates.
2. Move environment-specific configuration (API base URL, keys) into environment variables or into `app.config.js` / secure secret stores. Avoid committing API keys to the repo.
3. Add error handling and retries for network requests. Update `AuthContext` to persist tokens securely (SecureStore or Keychain) if needed.
4. Add unit/integration tests for service functions (mock network requests during tests).

Notes
-----
- Right now the code is wired to call the mock services. Replacing the mocks is intentionally low-friction: the `AuthContext` and screens import from `services/*` directly, so a backend swap is just updating those service implementations.
- If you prefer to keep both mock and real implementations, you can expose a small factory (e.g., `services/index.ts`) that selects `mock` vs `real` implementation based on an environment flag (NODE_ENV or custom variable). This makes toggling easy during development.

Backend overview (Node.js + Supabase)
-------------------------------------

- Location: `Mobile-App/backend`.
- Technology: Node.js, Express, Supabase JS client, Postgres (Supabase).

Key pieces:

- `server.js`
  - Initializes Express and connects to Supabase using `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `.env`.
  - `GET /health` — simple health check.
  - `POST /api/report-incident`
    - Accepts `{ video_url, lat, lng, user_phone_number, location_address }` from the mobile app.
    - Inserts a new incident row into `public.incidents` (as defined in `backend/database.sql`).
    - Returns `{ success, incident_id }` immediately so the app stays responsive.
    - Starts a 4‑second async “AI analysis” that:
      - Picks a random emergency type (`fire`, `medical`, `police`).
      - Updates the incident with `service_type` and `detected_at`.
      - Queries `public.emergency_responders` for active responders of that type.
      - Randomly selects one and updates the incident with `responder_phone_number`, `status = 'assigned'`, and `assigned_at`.
  - `GET /api/incident/:incidentId`
    - Fetches the incident row from Supabase.
    - If `responder_phone_number` is set, looks up that responder in `public.emergency_responders` to get base coordinates + station address.
    - Returns a JSON payload containing incident details, `assigned_dispatcher`, and `responder_base` that the mobile app maps to its `EmergencyReport` model.
  - Optional endpoints (`/api/responder-location`, `/api/incident/:id/responder-location`) support a future `responder_locations` table for live GPS tracking.

- `database.sql`
  - `public.emergency_responders` — responders with phone number, service type, optional base latitude/longitude, station address, `is_active`, and timestamps.
  - `public.incidents` — emergencies reported by users, including:
    - Reporter phone, incident location (`location_lat`, `location_lng`, `location_address`).
    - Optional `video_url` (mock for now, later a Supabase Storage URL).
    - Pipeline `status` (`pending`, `assigned`, `in_progress`, `resolved`).
    - AI + dispatch info: `service_type`, `responder_phone_number`, `detected_at`, `assigned_at`.

End-to-end flow (frontend ↔ backend ↔ database)
-----------------------------------------------

1. User opens the app, logs in (currently via mock auth), and grants location + camera permission.
2. On `VideoCameraScreen`, the user taps record; after the simulated recording finishes, the app calls `sendVideoReport()` in `services/ReportService.ts`.
3. `ReportService` sends `POST /api/report-incident` to the backend with lat/lng, phone, address, and a placeholder `video_url`.
4. Backend inserts an incident in Supabase and kicks off async AI + responder assignment.
5. The app waits a few seconds, then calls `getIncidentDetails()` (GET `/api/incident/:id`) to retrieve the assigned responder + base.
6. `ReportService` stores a “pending route” (user + responder locations, dispatcher name/phone) in memory.
7. `HomeScreen` consumes that pending route to:
   - Show markers for user and responder on the map.
   - Draw a line between them and compute distance/ETA (Haversine) client-side.

This architecture keeps the API surface small and makes it easy to upgrade pieces later (real auth via Supabase, real video upload to Supabase Storage, and Mapbox for maps) without changing the overall flow.