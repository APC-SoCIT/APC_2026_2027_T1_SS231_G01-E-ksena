# E-ksena CI/CD Handover Guide
### What to Do When Your Azure for Students Credit Expires

---

## Situation Assessment

| Item | Where It Lives | Status |
|---|---|---|
| All source code | GitHub (`apcedgalauran` fork, `Web-app` branch) | ✅ **Safe** — GitHub is independent |
| `azure-pipelines.yml` | GitHub repo | ✅ **Safe** |
| `web.config`, all pipeline fixes | GitHub repo | ✅ **Safe** |
| Azure DevOps org (`dev.azure.com/E-ksena`) | Azure DevOps (free tier) | ✅ **Safe** — AzDO free tier is NOT tied to Azure subscription credits |
| Pipeline definition & build history | Azure DevOps | ✅ **Safe** |
| Secret pipeline variables (`EXPO_PUBLIC_*`) | Azure DevOps pipeline settings | ✅ **Safe** (as long as the AzDO org exists) |
| The Windows VM | Azure subscription (expired) | ⚠️ **Suspended** — VM will be deleted Dec 1, 2026 |
| IIS configuration on VM | On the VM | ⚠️ **At risk** if VM is deleted |
| Azure Pipelines Agent on VM | On the VM | ⚠️ **At risk** — needs to be re-registered on a new VM |

> [!IMPORTANT]
> The most important thing: **your code and pipeline YAML are already safe in GitHub**. The only thing you need to recreate is the **Windows VM** with IIS and the pipeline agent.

---

## What Your Groupmate Needs to Do

### Overview
One groupmate creates a new Azure for Students account, creates a new Windows VM, sets it up the same way, and registers it in the **same Azure DevOps organization**. The pipeline YAML doesn't need to change at all.

---

## Step 1 — Create a New Azure for Students Account

Your groupmate needs an active Azure for Students subscription.

1. Go to: **https://azure.microsoft.com/en-us/free/students/**
2. Sign in with their **APC school email** (the one ending in `@student.apc.edu.ph`)
3. They get **$100 free credit** — no credit card needed

---

## Step 2 — Create a Windows VM in Azure Portal

1. Go to **https://portal.azure.com** (signed in with the groupmate's account)
2. Search **"Virtual Machines"** → **Create** → **Azure Virtual Machine**
3. Fill in:

| Setting | Value |
|---|---|
| **Resource group** | Create new: `E-ksena-RG` |
| **VM name** | `E-ksena-Virtual` |
| **Region** | Same as before (e.g. Southeast Asia) |
| **Image** | Windows Server 2025 Datacenter |
| **Size** | `Standard_B2s` (2 vCPU, 4GB RAM — cheapest that works) |
| **Username** | `apcedgalauran` (or any admin username) |
| **Password** | Set a strong password — **save it** |
| **Public inbound ports** | Allow RDP (3389) |

4. **Networking tab** → add inbound rule for port **80** (HTTP for IIS)
5. Click **Review + Create** → **Create**
6. Wait ~3 minutes for deployment → copy the **Public IP address**

---

## Step 3 — Connect to the VM via RDP (from Mac)

1. Open **Microsoft Remote Desktop** (Mac App Store — free)
2. Add PC → enter the VM's **Public IP**
3. Username: the one you set in Step 2
4. Connect

---

## Step 4 — Set Up IIS on the VM

Open **PowerShell as Administrator** on the VM and run:

```powershell
# Install IIS with management tools
Install-WindowsFeature -Name Web-Server, Web-Mgmt-Console, Web-Mgmt-Tools `
    -IncludeManagementTools

# Verify IIS installed
Get-Service W3SVC
```

Then open **IIS Manager** (`Win + R` → `inetmgr`) and create the E-ksena site:

1. Right-click **Sites** → **Add Website**
2. Fill in:
   - **Site name:** `E-ksena`
   - **Physical path:** `C:\inetpub\wwwroot\E-ksena`
   - **Port:** `80`
3. Click **OK**
4. Create the directory if it doesn't exist:

```powershell
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\E-ksena" -Force
```

---

## Step 5 — Install Node.js on the VM

```powershell
# Download and install Node.js 20 LTS
$nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
$installer = "$env:TEMP\node.msi"
Invoke-WebRequest -Uri $nodeUrl -OutFile $installer
Start-Process msiexec -ArgumentList "/i $installer /quiet /norestart" -Wait
# Verify
node --version
npm --version
```

---

## Step 6 — Install IIS URL Rewrite Module

This is required for Expo Router SPA deep-link routing.

1. Download from: **https://www.iis.net/downloads/microsoft/url-rewrite**
2. Run the installer on the VM
3. Or use PowerShell:

```powershell
$rewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
$installer = "$env:TEMP\rewrite.msi"
Invoke-WebRequest -Uri $rewriteUrl -OutFile $installer
Start-Process msiexec -ArgumentList "/i $installer /quiet /norestart" -Wait
Write-Host "URL Rewrite installed"
```

---

## Step 7 — Register the VM as an Azure Pipelines Agent

This connects the new VM to the **existing** Azure DevOps organization.

### 7a — Get a Personal Access Token from Azure DevOps

1. Go to **https://dev.azure.com/E-ksena** (sign in with your account — the AzDO org is still there)
2. Click your profile picture (top right) → **Personal Access Tokens**
3. Click **New Token**:
   - Name: `E-ksena-VM-Agent`
   - Organization: `E-ksena`
   - Expiration: 1 year
   - Scopes: **Agent Pools (read, manage)**
4. Click **Create** → **copy the token immediately** (you won't see it again)

### 7b — Download and configure the agent on the VM

Run this in **PowerShell as Administrator** on the VM:

```powershell
# Create agent directory
mkdir C:\azagent\A1 -Force
cd C:\azagent\A1

# Download the agent
$agentUrl = "https://vstsagentpackage.azureedge.net/agent/3.246.0/vsts-agent-win-x64-3.246.0.zip"
Invoke-WebRequest -Uri $agentUrl -OutFile agent.zip
Expand-Archive -Path agent.zip -DestinationPath . -Force

# Configure the agent
.\config.cmd --unattended `
    --url "https://dev.azure.com/E-ksena" `
    --auth pat `
    --token "PASTE_YOUR_PAT_HERE" `
    --pool "E-ksena.Staging" `
    --agent "E-ksena-Virtual" `
    --runAsService `
    --windowsLogonAccount "NT AUTHORITY\SYSTEM"
```

> [!NOTE]
> Replace `PASTE_YOUR_PAT_HERE` with the token from Step 7a.
> The `--windowsLogonAccount "NT AUTHORITY\SYSTEM"` sets it to Local System immediately — this was required for IIS service control.

### 7c — Verify the agent is online

1. Go to **Azure DevOps** → **Project Settings** → **Agent Pools** → **E-ksena.Staging**
2. You should see `E-ksena-Virtual` with a 🟢 green dot (Online)

---

## Step 8 — Verify Secret Variables Are Still Set

1. Go to **Azure DevOps** → your pipeline → **Edit** → **Variables**
2. Check that these 3 still exist (they should — AzDO keeps them):
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
3. If any are missing, re-add them from your Supabase dashboard and Google Cloud Console

---

## Step 9 — Run the Pipeline

1. Go to your pipeline → **Run pipeline** → **Run**
2. The `Build Web App` stage will run on the new VM
3. The `Deploy to IIS on Windows VM` stage will deploy to the new VM's IIS

First successful run ✅ — your app is live again on the new VM's IP.

---

## Step 10 — Update the Network Security Group (Open Port 80)

To access the app from outside the VM:

1. Go to **portal.azure.com** → your VM → **Networking** → **Network Security Group**
2. Click **Add inbound port rule**:
   - Source: `Any`
   - Destination port: `80`
   - Protocol: `TCP`
   - Action: `Allow`
   - Priority: `100`
   - Name: `Allow-HTTP`
3. Click **Add**
4. Visit `http://<NEW-VM-IP>` in a browser — your app should load

---

## Answers to Your Specific Questions

### Q: Should groupmates fork the org repo to their personal accounts?
**No, not necessary.** The pipeline is already linked to your fork (`apcedgalauran/APC_2026_2027_T1_SS231_G01-E-ksena`). The groupmate only needs to:
- Create the Azure VM
- Register it as an agent in the **existing** AzDO org

The pipeline YAML doesn't change. The code repo doesn't change.

### Q: Should each groupmate create their own VM?
**One VM is enough.** Only one person needs to host the VM at a time. The VM just needs to be up when you want to deploy. You don't need one VM per person.

If your groupmate has an active Azure for Students credit, they create the VM. When their credit expires in the future, the next groupmate with active credit takes over by repeating Steps 1–10.

### Q: Do the groupmates also create new Azure DevOps organizations?
**No.** The Azure DevOps organization (`dev.azure.com/E-ksena`) is **free** and independent of Azure subscription credits. It will stay active. Groupmates just need to be invited as members of the AzDO project.

---

## Before Your VM Gets Deleted (Dec 1, 2026)

If you want to export your IIS configuration from the current VM before it's deleted:

1. RDP into the current VM while it's still accessible
2. Run in PowerShell:

```powershell
# Export IIS config
& "$env:SystemRoot\System32\inetsrv\appcmd.exe" list site "E-ksena" /config > C:\iis-site-backup.xml
Copy-Item C:\iis-site-backup.xml C:\Users\Public\Desktop\
```

This isn't strictly necessary (we have all the config steps documented above) but it's good to have.

---

## Summary — Who Does What

| Person | Action |
|---|---|
| **You (Ezekiel)** | Keep the GitHub fork and Azure DevOps org — they're still yours and still active |
| **Groupmate with active Azure credit** | Creates new VM, sets up IIS + Node.js, registers as agent (Steps 1–9 above) |
| **Whole team** | Push to `Web-app` branch → pipeline auto-runs on new VM |
