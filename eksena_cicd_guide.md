# E-ksena Azure DevOps CI/CD — Complete Fix Guide

## What Was Wrong (Root Cause Analysis)

| Problem | Why it failed |
|---|---|
| Pipeline ran on `main` branch | `main` only has `README.md` + `docs/` — zero source code |
| Pipeline used .NET tasks (`VSBuild`, `NuGetCommand`) | The project is Node.js/Expo, not .NET — no `.sln` file exists |
| Used `vmImage: ubuntu-latest` | Your self-hosted agent on the Windows VM was being ignored |
| Fork (`apcedgalauran`) had the pipeline, not the original | The pipeline should live in the **original** `APC-SoCIT` repo |

---

## Your Actual Project Structure (Web-app branch)

```
APC_2026_2027_T1_SS231_G01-E-ksena/  (Web-app branch)
├── package.json                      ← Root workspace (install:all script)
├── package-lock.json
├── E-ksena_Backend/
│   ├── server.js                     ← Node.js Express backend
│   └── package.json                  ← "start": "node server.js"
└── E-ksena-webapp-all-files/
    ├── package.json                  ← "build:web": "expo export --platform web"
    ├── app/                          ← Expo Router screens
    └── ...
```

**Key scripts confirmed from your actual `package.json` files:**
- `npm run install:all` → installs root + backend + frontend deps
- `npm --prefix E-ksena-webapp-all-files run build:web` → `expo export --platform web` → outputs to `E-ksena-webapp-all-files/dist/`
- Backend: `node server.js`

---

## The Corrected `azure-pipelines.yml`

The file has been created at:
[azure-pipelines.yml](file:///c:/Users/Ezekiel/Documents/code/alt%20run%20new%20folder%20original%20web%20app/azure-pipelines.yml)

**Key decisions in the new pipeline:**

| Setting | Value | Reason |
|---|---|---|
| `trigger` | `Web-app` | That's where your code lives |
| `pool.name` | `E-ksena.Staging` | Uses YOUR self-hosted agent on the VM |
| Build script | `npm run install:all` | Matches your root `package.json` |
| Build web | `npm --prefix E-ksena-webapp-all-files run build:web` | Expo export for web |
| Deploy path | `C:\inetpub\wwwroot\E-ksena` | Standard IIS wwwroot subfolder |
| Deploy job | `deployment:` type with `environment:` | Enables deployment tracking in Azure DevOps |

---

## Step-by-Step: How to Get This Working

### Step 1 — Push the pipeline to the ORIGINAL repo's `Web-app` branch

You cannot push from your fork to `APC-SoCIT`. You need to either:

**Option A — If you have write access to the original repo:**
```bash
# Clone the original repo
git clone https://github.com/APC-SoCIT/APC_2026_2027_T1_SS231_G01-E-ksena.git
cd APC_2026_2027_T1_SS231_G01-E-ksena

# Switch to Web-app branch
git checkout Web-app

# Copy the pipeline file in
# (copy azure-pipelines.yml from your local folder into this directory)
git add azure-pipelines.yml
git commit -m "Add Azure DevOps CI/CD pipeline for web app"
git push origin Web-app
```

**Option B — Via Pull Request from your fork:**
1. Make sure your fork's `Web-app` branch has the `azure-pipelines.yml`
2. Open a PR from `apcedgalauran/Web-app` → `APC-SoCIT/Web-app`
3. Merge it — the pipeline will fire automatically

---

### Step 2 — Configure the Azure DevOps Pipeline to watch the ORIGINAL repo

1. Go to **Azure DevOps → Pipelines → your pipeline → Edit**
2. Change the repository connection from `apcedgalauran/...` to `APC-SoCIT/APC_2026_2027_T1_SS231_G01-E-ksena`
3. Set branch to **`Web-app`**

OR create a brand new pipeline:
- **Pipelines → New Pipeline → GitHub → APC-SoCIT repo → Existing YAML file → `/azure-pipelines.yml` on branch `Web-app`**

---

### Step 3 — Create the Environment in Azure DevOps

The Deploy stage references `environment: 'E-ksena-Staging'`. Create it:
1. **Azure DevOps → Pipelines → Environments → New Environment**
2. Name: `E-ksena-Staging`, Resource: `None`
3. Click **Create**

---

### Step 4 — Verify the Self-Hosted Agent (Already Done!)

From your screenshot, you already installed the agent on the VM. The pool `E-ksena.Staging` and agent `E-ksena-Virtual` are registered.

> [!IMPORTANT]
> The agent **must stay running** on the VM. You can verify via:
> - **Azure DevOps → Project Settings → Agent Pools → E-ksena.Staging** → agent should show **Online** (green)
> - On the VM via Server Manager → Services → `vstsagent.E-ksena.Staging.E-ksena-Virtual` → Running

If the pipeline asks "Enter replace? (Y/N)" like in your screenshot — type **Y** to replace the old agent registration.

---

### Step 5 — Set Up IIS on the VM (Via RDP)

Connect via RDP (you're already doing this). Then in PowerShell **as Administrator**:

```powershell
# 1. Install IIS if not already installed
Install-WindowsFeature -Name Web-Server -IncludeManagementTools

# 2. Create the site directory
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\E-ksena" -Force

# 3. Verify IIS is running
Get-Service W3SVC
iisreset /status
```

**Configure IIS to serve your Expo web build:**
1. Open **IIS Manager** (Server Manager → Tools → IIS Manager)
2. Expand your server → **Sites**
3. If a "Default Web Site" exists, either:
   - Point its physical path to `C:\inetpub\wwwroot\E-ksena`, or
   - Add a new site pointing there on port 80
4. Your Expo web export (`dist/`) creates static HTML/JS/CSS — IIS serves these natively

> [!TIP]
> Since Expo exports a SPA (Single Page App), add a URL Rewrite rule or set `index.html` as the default document in IIS.

---

## Web App vs Mobile App — Where to Host

| App | Technology | Where to Deploy |
|---|---|---|
| **Web App** (`E-ksena-webapp-all-files`) | Expo Web → static HTML/JS/CSS | ✅ **Your Windows Server VM with IIS** |
| **Backend** (`E-ksena_Backend`) | Node.js Express (`node server.js`) | ✅ **Same VM**, but NOT through IIS — run as a Windows Service or PM2 |
| **Mobile App** (`Mobile-app` branch) | Expo React Native | ❌ NOT on the VM — build with **Expo EAS Build** or deploy to app stores |

### Backend on the VM (Node.js doesn't go through IIS directly)

IIS serves **static files** only. Your Node.js backend runs as a separate process. On the VM via PowerShell:

```powershell
# Install PM2 globally to keep backend running
npm install -g pm2

# Start the backend
cd C:\inetpub\wwwroot\E-ksena\E-ksena_Backend
pm2 start server.js --name e-ksena-backend

# Auto-start on reboot
pm2 startup
pm2 save
```

Then configure IIS **Application Request Routing (ARR)** or a reverse proxy to forward `/api/*` requests to `localhost:PORT` where your Node server listens.

---

## Keeping Your Fork in Sync

Your fork should NOT have different files from the original. To sync:

```bash
# Add the original as upstream (one time)
git remote add upstream https://github.com/APC-SoCIT/APC_2026_2027_T1_SS231_G01-E-ksena.git

# Sync Web-app branch from upstream
git checkout Web-app
git fetch upstream
git merge upstream/Web-app

# Push synced state to your fork
git push origin Web-app
```

> [!NOTE]
> Your Azure DevOps pipeline should be connected to the **original `APC-SoCIT` repo**, not your fork. Your fork is just your personal working copy.

---

## Summary Checklist

- [ ] `azure-pipelines.yml` committed to **`APC-SoCIT` repo, `Web-app` branch**
- [ ] Azure DevOps pipeline connected to **`APC-SoCIT` repo** (not the fork)
- [ ] Pipeline trigger set to **`Web-app`** branch
- [ ] Agent pool `E-ksena.Staging` with `E-ksena-Virtual` agent showing **Online**
- [ ] Environment `E-ksena-Staging` created in Azure DevOps
- [ ] IIS installed on VM with site pointing to `C:\inetpub\wwwroot\E-ksena`
- [ ] Backend (`server.js`) running separately via PM2 on the VM
- [ ] Mobile app planned for Expo EAS or app store deployment (NOT on the VM)
