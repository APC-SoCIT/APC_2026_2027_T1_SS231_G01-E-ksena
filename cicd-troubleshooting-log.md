# E-ksena Azure DevOps CI/CD Pipeline — Troubleshooting Log

> **Pipeline:** `apcedgalauran/APC_2026_2027_T1_SS231_G01-E-ksena` · Branch: `Web-app`
> **Agent:** Self-hosted Windows Server 2025 VM (`E-ksena-Virtual`)
> **Target:** IIS on the same VM

---

## Part 1 — Quick-Reference Summary

| # | Stage | Error | Root Cause | Fix Applied |
|---|---|---|---|---|
| 1 | Build | `git clean` hangs indefinitely | npm self-referential symlink caused infinite recursion | Added `workspace: clean: all` |
| 2 | Build | Checkout times out (60+ seconds) | No shallow clone; slow VM network to GitHub | Added `fetchDepth: 1`, `lfs: false` |
| 3 | Build | `expo is not recognized` | `npm --prefix` reads lock file from wrong directory | Replaced with separate `script` steps + `workingDirectory` |
| 4 | Build | `npx expo` downloads from npm registry | npm v9+ `npx` looks in process CWD, not `workingDirectory` | Call `node_modules\.bin\expo.cmd` directly |
| 5 | Build | `expo.cmd not found` | `cd dir && npm ci` in batch script — unreliable `cd` persistence | Split into 3 independent `script` steps each with `workingDirectory` |
| 6 | Build | `Missing required environment variables` | `lib/env.ts` throws at bundle time when Supabase/Maps keys absent | Added 3 secret pipeline variables + `env:` block on build step |
| 7 | Deploy | `iisreset /stop` access denied | `iisreset` requires UAC-elevated token; agent runs non-elevated | Replaced with `Stop-Service W3SVC -Force` |
| 8 | Deploy | `Stop-Service` cannot open W3SVC | Agent account lacked SCM rights for W3SVC | Changed agent service Log On to **Local System** in `services.msc` |
| 9 | Deploy | `Expand-Archive` access denied on `(tabs)\` | IIS still running (stop failed), files locked; `(tabs)` is valid Expo Router path | Resolved by fixing issue 8; IIS now stops cleanly |
| 10 | Deploy | `403.14` in browser | Pipeline targeted wrong IIS site; no SPA default document rule | Target `E-ksena` site directly; add `web.config` with SPA routing |
| 11 | Deploy | YAML parse error — "Informational run" | Raw XML embedded in YAML `script:` block broke the parser | Moved `web.config` to a committed repo file; pipeline uses `Copy-Item` |
| 12 | Deploy | `Get-WebSite` cannot read `redirection.config` | `WebAdministration` module requires IIS config file ACL access | Replaced verify step with `Get-Service` + `Test-Path` checks |

---

## Part 2 — In-Depth Technical Discussion

### Issue 1 — Git Clean Infinite Loop

**Symptom:** "Checkout repository" step hung indefinitely; job timed out.

**Root cause:** `package.json` at the repo root has `"name": "e-ksena-workspace"`. When `npm install` runs, npm creates a self-referential symlink: `node_modules/e-ksena-workspace → ../`. The Azure Pipelines checkout task runs `git clean -ffdx` to wipe untracked files. `git clean` follows symlinks and enters the infinite loop `node_modules/e-ksena-workspace/node_modules/e-ksena-workspace/...` causing the hang.

**Fix:**
```yaml
workspace:
  clean: all   # Deletes $(Agent.BuildDirectory) before job — bypasses git clean entirely

- checkout: self
  clean: false  # Don't run git clean again
  fetchDepth: 1
```

---

### Issue 2 — Slow Checkout

**Symptom:** Checkout took 60+ seconds and occasionally timed out.

**Root cause:** Full clone downloads entire commit history. The Windows VM has throttled network connectivity to GitHub.

**Fix:** Shallow clone (`fetchDepth: 1`) only fetches the latest commit. Reduced checkout from 60s to ~10s.

---

### Issues 3–5 — Expo Binary Not Found (Three Iterations)

This was the most persistent build problem, requiring three rounds of diagnosis.

#### Attempt 1 — `npm --prefix` (FAILED)

```bash
npm --prefix E-ksena-webapp-all-files run build:web
```

`npm --prefix <dir>` sets the installation *target* directory, but npm reads `package-lock.json` from the **current working directory** — the repo root. The root lock file only has `concurrently`. Frontend packages including `expo` were never installed.

**Why it looked like it worked:** The install step reported success in ~14 seconds — impossibly fast for a full Expo project, but there was no exit code check, so the broken install was silent.

#### Attempt 2 — `npx expo` (FAILED)

```bash
npx expo export --platform web
# workingDirectory: .../E-ksena-webapp-all-files
```

In npm v9+, `npx <package>` searches for the package in the **process CWD** (where the agent launches the script), not in `workingDirectory`. The agent CWD was the repo root; `expo` was only in the frontend subdirectory. `npx` fell back to downloading `expo` fresh from npm, then failed because this isolated install couldn't find the project's Expo SDK.

#### Attempt 3 — `node_modules\.bin\expo.cmd` direct call (FAILED — install still broken)

The binary call strategy was correct, but `expo.cmd` didn't exist yet because the install step was still broken. A combined `cd dir && npm ci` multi-line batch script was used, but `cd` state in cmd.exe batch files is unreliable when chained across multiple lines in Azure Pipelines' generated `.cmd` file.

#### Final Fix — Separate `script` Steps

Each Azure Pipelines `script` step is an **independent cmd.exe process**. The agent sets `workingDirectory` as the process working directory *before* launching it — guaranteed correct, no `cd` needed.

```yaml
- script: npm install
  workingDirectory: '$(System.DefaultWorkingDirectory)\E-ksena-webapp-all-files'
  displayName: 'Install frontend dependencies'

- script: node_modules\.bin\expo.cmd export --platform web
  workingDirectory: '$(System.DefaultWorkingDirectory)\E-ksena-webapp-all-files'
  displayName: 'Build Expo web frontend'
```

---

### Issue 6 — Missing Environment Variables

**Symptom:**
```
Missing required environment variables: EXPO_PUBLIC_SUPABASE_URL, ...
  at factory (lib/env.ts:12:9)
```

**Root cause:** `lib/env.ts` reads `process.env.EXPO_PUBLIC_*` at **module load time** (during Metro bundling) and throws if any are undefined. The pipeline agent has no `.env` file and no env vars set.

**Fix:** Added 3 secret pipeline variables in Azure DevOps (Pipeline → Edit → Variables), then exposed them to the build step via `env:`:

```yaml
- script: node_modules\.bin\expo.cmd export --platform web
  workingDirectory: '...\E-ksena-webapp-all-files'
  env:
    EXPO_PUBLIC_SUPABASE_URL: $(EXPO_PUBLIC_SUPABASE_URL)
    EXPO_PUBLIC_SUPABASE_ANON_KEY: $(EXPO_PUBLIC_SUPABASE_ANON_KEY)
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: $(EXPO_PUBLIC_GOOGLE_MAPS_API_KEY)
```

---

### Issues 7–8 — IIS Service Control Permissions (Two Iterations)

#### `iisreset /stop` — Access Denied

`iisreset` communicates with the IIS Admin Service via a named pipe that requires a UAC-elevated process token. Azure Pipelines agent processes run with a standard (non-elevated) token even when the account is in the Administrators group.

**Attempted fix:** Replaced with `Stop-Service W3SVC -Force`.

#### `Stop-Service W3SVC` — "Cannot open W3SVC service on computer '.'"

`Stop-Service` goes through the Windows Service Control Manager (SCM). The SCM checks the W3SVC service's Security Descriptor. The agent's account lacked `SERVICE_STOP` rights on W3SVC.

**Root fix:** In `services.msc`, changed the Azure Pipelines agent service Log On from the admin account to **Local System**. Local System has implicit full rights over all local Windows services with no SCM permission checks.

**Pipeline resilience:** Wrapped the stop/start in `try/catch` with `net stop`/`net start` fallback so the deploy does not abort even if IIS control fails temporarily.

---

### Issue 9 — `(tabs)` Directory Extraction Failure

**Symptom:** `Expand-Archive` threw "Access to the path '(tabs)' is denied."

**Root cause:** Two factors combined:
1. IIS was still running (stop had failed), holding file handles on the deploy directory
2. `(tabs)` is a valid directory name — it's Expo Router's file-based routing notation for tab group layouts (e.g. `app/(tabs)/_layout.tsx`)

**Fix:** Once IIS stopped cleanly (issue 8 resolved), no file locks existed and extraction completed successfully.

---

### Issue 10 — 403.14 and Wrong IIS Site

**Symptom:** `localhost` on the VM showed "HTTP Error 403.14 — Directory listing denied."

**Root cause (two parts):**

1. **Wrong site targeted:** IIS had two sites — `Default Web Site` (Stopped) and `E-ksena` (Started, serving `C:\inetpub\wwwroot\E-ksena`). The pipeline was using `Stop-Service W3SVC` (stops all IIS) and trying to configure `Default Web Site` — both wrong. The running site was `E-ksena`.

2. **SPA routing not configured:** Expo Router is a client-side SPA. When visiting `localhost`, IIS looked for a default document but the default document list didn't include `index.html` explicitly, and there was no URL rewrite rule to serve `index.html` for unknown paths.

**Fix:**
- Changed pipeline to `Stop-WebSite "E-ksena"` / `Start-WebSite "E-ksena"`
- Added `web.config` with `<defaultDocument>` and URL Rewrite SPA fallback rule

---

### Issue 11 — YAML Parse Error from Inline XML

**Symptom:** Azure Pipelines showed "Informational run — YAML error."

**Root cause:** The `web.config` XML was generated inside a PowerShell here-string (`@'...'@`) embedded in the YAML `script: |` block. XML uses `<` and `>` extensively. The Azure Pipelines YAML parser encountered these characters and failed to parse the file.

**Fix:** Committed `web.config` as a standalone file at `E-ksena-webapp-all-files/web.config`. The deploy step now uses:

```powershell
Copy-Item "$repoRoot\E-ksena-webapp-all-files\web.config" "$deployPath\web.config" -Force
```

No XML in YAML — YAML parser is happy.

---

### Issue 12 — `Get-WebSite` Insufficient Permissions

**Symptom:**
```
Get-WebSite : Filename: redirection.config
Error: Cannot read configuration file due to insufficient permissions
```

**Root cause:** The `WebAdministration` PowerShell module reads IIS configuration from `%SystemRoot%\System32\inetsrv\config\`. The file `redirection.config` (and related config files) have ACLs that restrict read access to the **IIS_IUSRS** group and specific service accounts. Local System does not automatically get this access.

**Fix:** Replaced the verify step entirely with permission-free checks:

```powershell
# No WebAdministration module needed
$svc = Get-Service -Name W3SVC          # Does IIS run?
Test-Path "$deployPath\index.html"       # Was the build deployed?
Test-Path "$deployPath\web.config"       # Is SPA routing configured?
```

---

## Remaining Requirement — IIS URL Rewrite Module

The `web.config` SPA fallback rule requires the **IIS URL Rewrite** extension. Without it, deep links (e.g. direct navigation to `localhost/(tabs)/home`) return 404.

**Install on VM:** https://www.iis.net/downloads/microsoft/url-rewrite

The pipeline warns in the deploy logs if the module DLL is not found at `%SystemRoot%\System32\inetsrv\rewrite.dll`.
