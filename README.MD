# SAR Manager

Unified incident management platform for **Southeastern Alberta Search and Rescue (SEASAR)**. Consolidates D4H, CalTopo, ISRID lost person behaviour data, and SAR Alberta mutual aid into a single tool that guides a SAR Manager from the first call through deployment and ongoing operations.

---

## What It Does

When a call comes in, SAR Manager walks the SM through a structured intake wizard, then — with one click — fires off the full deployment sequence automatically:

1. **Creates the D4H incident** named `DD-MMM-YYYY #ID`, populates the public description and secure section with all wizard data, weather snapshot at IPP, and coordinates
2. **Creates the CalTopo map** in the SEASAR Operations folder, seeds it from your default GeoJSON template, drops IPP/PLS markers, and draws four ISRID probability rings (25/50/75/95%) for the subject's profile
3. **Posts the CalTopo link to D4H Whiteboard** as a pinned "Active Search" notice
4. **Sends a ≤150 character D4H callout** (via Twilio) to the team
5. **Pushes the operation to SAR Command Assist** (local tool on localhost:3002)

After deployment, a live dashboard gives the IC, Ops Chief, and Planning Chief role-specific task checklists plus seven operational tabs.

---

## Dashboard Tabs (post-deploy)

| Tab | What it shows |
|-----|--------------|
| **Rollout** | Role task checklists (IC / Ops Chief / Planning Chief / Searchers), persisted per operation |
| **Weather** | Current conditions + 3-day forecast at IPP via Open-Meteo; EC weather alerts for Alberta |
| **Lost Person Brief** | ISRID profile, probability ring distances with visual bars, subject summary |
| **SMEAC Briefing** | Auto-generated SMEAC team briefing, copyable to clipboard |
| **SAR AB Response** | 18 Alberta SAR groups ranked by straight-line distance from IPP; links to SAR AB map |
| **Push Update D4H** | Post a log entry to the D4H incident and whiteboard with quick-fill templates |
| **Second Callout** | Send a follow-up D4H/Twilio callout; live response tracker (attending / unavailable / pending) |

---

## Intake Wizard Steps

1. **Dispatch** — Tasking agency (RCMP, MHPS, AHS, STARS, CJFR, Other), OIC name/phone, operation type, priority, quick tags
2. **Who** — Subject name, age, sex, clothing, gear, physical description
3. **Where / When** — PLS and LKP in UTM format (ZoneNumber Letter Easting Northing), times, IPP designation
4. **Condition** — Circumstances, medical condition
5. **Safety** — Known hazards (free-text + quick tags including avalanche, thin ice, night operations, etc.)
6. **Profile** — ISRID subject category (hiker, child, dementia, horseback, etc.) and terrain type including Prairie

After the wizard, the SM chooses **Deploy** (triggers full automation) or **Discuss First** (generates a shareable discussion summary, then deploys when ready).

---

## Installation

### Option 1 — Windows GUI Installer (recommended for end users)

Build the installer once on your development machine (requires [Inno Setup 6](https://jrsoftware.org/isdl.php)):

```powershell
.\install\build-installer.ps1
```

This runs `npm install`, `npm run build`, bundles the standalone output, and compiles `dist\SAR Manager Setup.exe`. Distribute that `.exe` to end users — they double-click it and step through a wizard that asks:

1. **License agreement**
2. **Installation mode** — Client (starts at your login) or Server (starts at boot, network accessible)
3. **Port** (default 3000)
4. **Install location** (default `C:\Program Files\SAR Manager`)
5. **Desktop shortcut** option

Node.js 20 LTS is installed automatically via winget if not already present. No technical knowledge required from the end user.

**Prerequisites on the target machine:**
- SAR Command Assist must be installed at `C:\Program Files (x86)\BCSARA\SAR Command Assist\` before or after SAR Manager

### Option 1b — Windows (developer / script install)

Run from the repo root as Administrator:

```powershell
.\install\windows.ps1
```

Interactive — choose **Client** or **Server**. Builds the app on the target machine, registers a scheduled task, creates a desktop shortcut.

```powershell
# Uninstall
.\install\windows.ps1 -Uninstall
```

### Option 2 — Raspberry Pi or Linux server

Run from the repo root with sudo:

```bash
sudo bash install/linux.sh
```

Installs Node.js 20 via NodeSource, creates a `sarmanager` system user, installs to `/opt/sarmanager`, and registers a systemd service that starts on boot. Prints the LAN access URL when done.

```bash
# Uninstall
sudo bash install/linux.sh --uninstall
```

### Option 3 — Azure Web App

Requires [Azure CLI](https://aka.ms/installazurecliwindows) (`winget install Microsoft.AzureCLI`):

```powershell
.\install\azure.ps1
.\install\azure.ps1 -AppName mysar -Sku F1   # free tier
```

Uses `az webapp up` to create the resource group, App Service plan, and deploy in one step. The app is available at `https://<AppName>.azurewebsites.net`.

### Option 4 — Docker

```bash
docker build -t sarmanager .
docker run -p 3000:3000 sarmanager
```

Works on Azure Container Apps, a self-hosted Docker host, or any OCI-compatible runtime.

---

## Configuration (Settings page)

Navigate to `/settings` to configure before first use:

| Setting | Where to find it |
|---------|-----------------|
| **D4H API Token** | D4H Team Manager → Account → API |
| **CalTopo Credential ID** | caltopo.com/group/[your-group]/admin/details |
| **CalTopo Secret** | Same admin page |
| **CalTopo Account ID** | Same admin page |
| **CalTopo Folder ID** | Open your SEASAR Operations folder → copy ID from URL (`caltopo.com/f/<id>`) |
| **Default Map Template** | Upload a GeoJSON FeatureCollection — boundaries, sectors, waypoints added to every new map |

All settings are stored in browser localStorage (no account or server-side storage required).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Runtime data | localStorage (operations, settings) |
| Weather | Open-Meteo API + Environment Canada alerts |
| Maps | CalTopo Team API (HMAC-SHA256 signed, server-side proxy) |
| Incident mgmt | D4H Canada API (`api.team-manager.ca.d4h.com/v3`) |
| Coordinates | WGS84 ↔ UTM conversion (`lib/utm.ts`) |
| Lost person data | ISRID 15-profile database (`lib/isrid.ts`) |

---

## File Structure

```
app/
  page.tsx                  Landing page
  layout.tsx                Nav + providers
  operations/
    page.tsx                Operations list (active + closed)
    new/page.tsx            Start new operation
    [id]/page.tsx           Operation detail + deploy dashboard
  settings/page.tsx         Credential configuration
  api/
    caltopo/route.ts        CalTopo proxy (HMAC signing, server-side)
    d4h/route.ts            D4H proxy (incidents, whiteboard, callouts)
    weather/route.ts        Open-Meteo + EC alerts proxy

components/
  OperationIntake.tsx       6-step intake wizard
  OperationRollout.tsx      Decision screen → deploy dashboard (all 7 tabs)
  NewMapButton.tsx          Standalone CalTopo map creator

lib/
  operations-store.ts       localStorage CRUD for operations
  settings-context.tsx      React context for D4H + CalTopo credentials
  auth-context.tsx          Stub provider (legacy, unused)
  isrid.ts                  15 ISRID profiles + probability ring generator
  utm.ts                    UTM ↔ WGS84 conversion + formatting

install/
  windows.ps1               Windows installer (client + server modes)
  linux.sh                  Linux / Raspberry Pi installer
  azure.ps1                 Azure Web App deployment

Dockerfile                  Multi-stage container build (standalone output)
.dockerignore
```

---

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (outputs .next/standalone)
npm run lint
```

---

## License

Unlimited license granted to Southeastern Alberta Search and Rescue (SEASAR).  
Copyright © 2026 Pascal Hamish Seguin. All rights reserved.  
See [LICENSE](LICENSE) and [LICENSES](LICENSES) for full terms and third-party attributions.
