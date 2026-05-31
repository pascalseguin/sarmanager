# SAR Manager

Cloud-based incident management platform for **Southeastern Alberta Search and Rescue (SEASAR)**. Multi-device web application accessible from laptops at the command post, tablets on scene, and phones for individual team members.

Consolidates D4H, CalTopo, ISRID lost person behaviour data, and SAR Alberta mutual aid into a single tool that guides a SAR Manager from the first call through deployment, active search operations, and incident close-out.

---

## Architecture

```
Azure Static Web App / App Service
  Next.js 16 (App Router)  ←→  PostgreSQL (Azure Flexible Server)
  React 19 + Tailwind CSS        Real-time sync via Server-Sent Events
  Azure AD (MSAL.js) auth        or WebSockets (Socket.io)
```

All devices — SM laptop, team leader tablet, searcher phone — connect to the same operation in real time. No local installation required.

---

## Roles

| Role | What they see |
|------|--------------|
| **Search Manager (SM)** | Full dashboard: intake wizard, deployment, active board, all tabs |
| **Operations Chief / Planning Chief** | Role-specific task checklists + operational tabs |
| **Team Leader** | Team assignment, current task, equipment sign-out |
| **Searcher** | Check-in, personal gear assignment, current assignment, check-out |

---

## Deployment Workflow

When a call comes in, the SM runs the structured intake wizard, then — with one click — triggers full deployment:

1. **Creates the operation in the app** — named `DD-MMM-YYYY #ID`, populates public description and secure section with all wizard data, weather snapshot at IPP, and coordinates
2. **Creates the CalTopo map** — seeds from your default GeoJSON template, drops IPP/PLS markers, draws ISRID probability rings (25/50/75/95%) for the subject's profile

4. **Sends a ≤150 character D4H callout** (Twilio) to the team

---

## Intake Wizard Steps

1. **Dispatch** — Tasking agency (RCMP, MHPS), OIC name/phone, operation type, quick tags
2. **Who** — Subject name, age, sex, clothing, gear, physical description
3. **Where / When** — PLS and LKP in any format ie. street address, degrees, utm but then it converts to UTM format (ZoneNumber Letter Easting Northing), times, IPP designation
4. **Condition** — Circumstances, medical condition
5. **Safety** — Known hazards (free-text + quick tags: avalanche, thin ice, night ops, etc.)
6. **Profile** — ISRID subject category (hiker, child, dementia, horseback, etc.) and terrain type including Prairie

---

## Dashboard Tabs (active operation)

| Tab | Who uses it | What it shows |
|-----|------------|--------------|
| **Overview (Board)** | SM | Live member list, CalTopo iframe, equipment status, mutual aid, weather |
| **Check-In** | SM + team leaders | QR scan or manual searcher check-in; D4H roster import; global member lookup |
| **Teams** | SM | Create and manage search teams; assign members; set Search Type / Team Type / Notes / Assignments |
| **Equipment** | SM + searchers | Equipment inventory with field check, assignment, serial numbers, locations |
| **LPB** | SM + planning | ISRID profile, probability ring distances, category-specific interview questions, team briefing template |
| **SMEAC / LICE** | SM | Auto-generated briefing and LICE plan — copyable to clipboard |
| **CalTopo** | SM | Embedded map iframe; re-publish button |
| **Rollout** | SM / Ops / Planning | Role-specific task checklists (IC / Ops Chief / Planning Chief) |
| **Weather** | All | Current conditions + 3-day forecast at IPP; EC weather alerts for Alberta |
| **SAR AB Response** | SM | 18 Alberta SAR groups ranked by drive time from IPP |
| **Push Update D4H** | SM | Post log entry to D4H incident and whiteboard with quick-fill templates |
| **Second Callout** | SM | Follow-up DTwilio callout; live response tracker |
| **Operation Edit** | SM | Edit subject details, clothing, medical, safety, PLS/LKP descriptions |

--------------------------------------------------------------------------------------------------------------------------

## Equipment Tracking1

Equipment is tracked per operation with:
- **Tag** (V1, P3, R1.7X…), **Name**, **Brand**, **Serial / Asset #**, **Type**, **Location / Container**
- **Field check** (pre-deployment inspection) — records who inspected and when
- **Assignment** — assign to a team or individual member
- QR scan for rapid equipment check-in (format: `sareq1|Tag|Name|Type`)
- JSON bulk import for pre-configured equipment lists
- Field-editable location and serial fields directly in the list view

--------------------------------------------------------------------------------------------------------------------------


## Member Check-In

- QR scan from pre-printed member cards (format: `sar1|Name|Quals|Phone`)
- Physical tag scan — `sar-tag|CODE` looks up the member in the QR registry
- Manual entry with callsign auto-suggestion (S1, S2…)
- One-click check-in from D4H roster or registered team members
- Last-heard status tracking: green < 45 min, yellow 45–60 min, red > 60 min (ICS standard)

--------------------------------------------------------------------------------------------------------------------------

## Incident Report Export

At close-out, the operation can be exported as a structured plain-text document suitable for D4H incident reports:
- Subject details and circumstance
- All team assignments and task history
- Equipment deployment log
- Member attendance (check-in / check-out times)
- SMEAC briefing content
- Callout and response summary

---

## Environment Variables

Copy `.env.example` to `.env.local` (gitignored) before running locally, or configure these as App Settings on Azure / environment variables in Docker.

| Variable | Required | Description |
|----------|----------|-------------|
| `CONTACT_EMAIL` | Recommended | Email included in the Nominatim geocoder User-Agent. Nominatim's [ToS](https://nominatim.org/release-docs/latest/api/Search/) require a valid contact address. Defaults to `contact@example.com` if unset. |

All other credentials (D4H API Token, CalTopo Credential ID / Secret / Account ID) are entered by users through the **Settings page** (`/settings`) and stored in their browser's `localStorage`. They are never written to the server or to any config file.

---

## Configuration (Settings page)

Navigate to `/settings` to configure before first use:

| Setting | Where to find it |
|---------|-----------------|
| **D4H API Token** | D4H Team Manager → Account → API |
| **CalTopo Credential ID** | caltopo.com/group/[your-group]/admin/details |
| **CalTopo Secret** | Same admin page |
| **CalTopo Account ID** | Same admin page |
| **CalTopo Folder ID** | Open your SEASAR Operations folder → copy ID from URL |
| **Default Map Template** | Upload a GeoJSON FeatureCollection — boundaries, sectors, waypoints added to every new map |
| **Callout Line** | Phone number for callout messages |
| **SM Phone** | Search Manager contact number |
| **Quals Groups** | Comma-separated D4H group names to import as qualifications |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Authentication | Azure Active Directory (MSAL.js + @azure/msal-react) |
| Database | PostgreSQL — Azure Database for PostgreSQL Flexible Server |
| Real-time sync | Server-Sent Events / Socket.io (per-operation rooms) |
| Weather | Open-Meteo API + Environment Canada alerts |
| Maps | CalTopo Team API (HMAC-SHA256 signed, server-side proxy) |
| Incident mgmt | D4H Canada API (`api.team-manager.ca.d4h.com/v3`) |
| Coordinates | WGS84 ↔ UTM conversion (`lib/utm.ts`) |
| Lost person data | ISRID 15-profile database (`lib/isrid.ts`) |
| Deployment | Azure App Service + Azure Static Web Apps |

---

## File Structure

```
app/
  page.tsx                   Landing page / operation list
  layout.tsx                 Nav, auth provider, providers
  operations/
    page.tsx                 Active + closed operations
    new/page.tsx             Start new operation (intake wizard)
    [id]/
      page.tsx               Operation detail + full dashboard
      board/page.tsx         Live command post overview
  settings/page.tsx          Credential + configuration
  api/
    caltopo/route.ts         CalTopo proxy (HMAC signing, server-side)
    d4h/route.ts             D4H proxy (incidents, whiteboard, callouts)
    weather/route.ts         Open-Meteo + EC alerts proxy
    operations/route.ts      CRUD for operations
    users/route.ts           Team member registry
    settings/route.ts        Org settings

components/
  OperationIntake.tsx        6-step intake wizard
  IncidentBase.tsx           Main operational dashboard (all tabs)
  SearcherPortal.tsx         Mobile-first searcher view (check-in, gear, assignment)
  LPBTab.tsx                 Lost Person Behaviour profile + interview questions
  SmeacTab.tsx               SMEAC and LICE briefing generator
  EquipmentWidget.tsx        Compact equipment sidebar widget

lib/
  isrid.ts                   15 ISRID profiles + probability ring generator
  utm.ts                     UTM ↔ WGS84 conversion + formatting
  caltopo.ts                 CalTopo Team API client (HMAC-SHA256)
  api.ts                     Frontend API client

Dockerfile                   Multi-stage container build
.dockerignore
```

---

## Deployment

### Quick start (clone from GitHub)

```bash
git clone https://github.com/<your-org>/sarmanager.git
cd sarmanager
cp .env.example .env.local          # then edit CONTACT_EMAIL
npm install
npm run dev                         # http://localhost:3000
```

Open `/settings` and enter your D4H token and CalTopo credentials. They are saved in your browser only — nothing is written to disk or committed to git.

---

### Azure App Service (recommended)

Requires [Azure CLI](https://aka.ms/installazurecliwindows):

```powershell
.\install\azure.ps1
.\install\azure.ps1 -AppName mysar -Sku F1   # free tier
```

Uses `az webapp up` to create the resource group, App Service plan, and deploy in one step. App is available at `https://<AppName>.azurewebsites.net`.

### Docker

```bash
docker build -t sarmanager .
docker run -p 3000:3000 sarmanager
```

Works on Azure Container Apps, self-hosted Docker hosts, or any OCI-compatible runtime.

---

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
```

---

## Authentication

Team members sign in with their Microsoft / Azure AD organizational accounts. No separate passwords required. Role assignment is managed in the Settings page — map Azure AD users or groups to SM, Operations Chief, Planning Chief, or Searcher roles.

For organizations without Azure AD, email/password authentication is available as a fallback.

---

## License

Unlimited license granted to Southeastern Alberta Search and Rescue (SEASAR).
Copyright © 2026 Pascal Hamish Seguin. All rights reserved.
See [LICENSE](LICENSE) and [LICENSES](LICENSES) for full terms and third-party attributions.
