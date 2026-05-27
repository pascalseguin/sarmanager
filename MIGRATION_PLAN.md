# SAR Manager — Cloud Migration Plan

**Goal:** Migrate from the Electron desktop app (Electron + Express + SQLite + React/Vite) to the Next.js cloud web app (Azure App Service + PostgreSQL + MSAL.js) while preserving all operational features.

**Guiding principles:**
- The Next.js foundation (`sarmanager/`) already exists — build on it, don't start fresh.
- Port operational logic from the Electron worktree (`sarmanager.worktrees/copilot-worktree-2026-05-14T13-49-47/`) after the platform is stable.
- Design single-org first, multi-org safe (add `org_id` columns from day one; enforce it in queries from day one).
- No credentials in the repo. All secrets via environment variables or Azure Key Vault.

---

## Current State

| Layer | Electron App (source of truth for features) | Next.js App (migration target) |
|---|---|---|
| Runtime | Electron + Node.js Express (port 3001) | Next.js 16 App Router |
| Frontend | React 18 + Vite | React 19 + Tailwind CSS 4 |
| Storage | SQLite (better-sqlite3) | localStorage (IBState under `ib-{opId}`) |
| Auth | None | Stub `auth-context.tsx` (no real auth) |
| Real-time | Polling / local state | None yet |
| Deployment | Windows/Linux installer (`publish.ps1`) | None deployed yet |

The Electron app has all the operational intelligence. The Next.js app has the right architecture but needs features ported in.

---

## Phase 1 — Database (PostgreSQL)

**Outcome:** Replace localStorage IBState with PostgreSQL. Operations survive a page refresh, work across devices.

### Tasks

1. **Provision database**
   - Azure Database for PostgreSQL Flexible Server (dev: local Docker `postgres:16`)
   - Connection string in `DATABASE_URL` env var
   - Install `pg` package (already in `package.json`)

2. **Schema** — create these tables:

   ```sql
   -- Multi-org anchor (leave populated with one row until Phase 6)
   CREATE TABLE organizations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE TABLE operations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID REFERENCES organizations(id),
     status TEXT NOT NULL DEFAULT 'active',  -- active | closed
     -- Intake wizard fields
     tasking_agency TEXT,
     oic_name TEXT,
     oic_phone TEXT,
     operation_type TEXT,
     priority TEXT,
     quick_tags TEXT[],
     -- Subject
     subject_name TEXT,
     subject_age INT,
     subject_sex TEXT,
     subject_clothing TEXT,
     subject_gear TEXT,
     subject_description TEXT,
     -- Location (always store as WGS84 internally; display as UTM)
     pls_lat DOUBLE PRECISION,
     pls_lon DOUBLE PRECISION,
     pls_desc TEXT,
     lkp_lat DOUBLE PRECISION,
     lkp_lon DOUBLE PRECISION,
     lkp_desc TEXT,
     ipp_designation TEXT,
     -- Times
     call_time TIMESTAMPTZ,
     subject_time TIMESTAMPTZ,
     -- Condition / safety / profile
     circumstances TEXT,
     medical TEXT,
     safety TEXT,
     safety_tags TEXT[],
     isrid_category TEXT,
     terrain_type TEXT,
     -- External refs
     d4h_incident_id TEXT,
     caltopo_map_id TEXT,
     caltopo_map_url TEXT,
     -- Metadata
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE TABLE members (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID REFERENCES organizations(id),
     operation_id UUID REFERENCES operations(id),
     name TEXT NOT NULL,
     callsign TEXT,
     qualifications TEXT,
     phone TEXT,
     d4h_id TEXT,
     -- Check-in state
     checked_in BOOLEAN DEFAULT false,
     check_in_time TIMESTAMPTZ,
     check_out_time TIMESTAMPTZ,
     last_heard TIMESTAMPTZ,
     -- Role within operation
     team_id UUID,   -- FK added after teams table exists
     role TEXT       -- searcher | team_leader | ops | planning | sm
   );

   CREATE TABLE teams (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     operation_id UUID REFERENCES operations(id),
     name TEXT NOT NULL,
     search_type TEXT,
     team_type TEXT,
     notes TEXT,
     assignment TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   -- Add FK now that both tables exist
   ALTER TABLE members ADD CONSTRAINT fk_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

   CREATE TABLE equipment (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     operation_id UUID REFERENCES operations(id),
     tag TEXT,
     name TEXT NOT NULL,
     brand TEXT,
     serial TEXT,
     type TEXT,
     location TEXT,
     field_check BOOLEAN DEFAULT false,
     field_check_by TEXT,
     field_check_time TIMESTAMPTZ,
     assigned_to TEXT,   -- member name or team name
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE TABLE settings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID REFERENCES organizations(id) UNIQUE,
     d4h_api_token TEXT,
     caltopo_credential_id TEXT,
     caltopo_secret TEXT,
     caltopo_account_id TEXT,
     caltopo_folder_id TEXT,
     default_map_template JSONB,
     callout_line TEXT,
     sm_phone TEXT,
     quals_groups TEXT[],
     updated_at TIMESTAMPTZ DEFAULT now()
   );
   ```

3. **API routes** (`app/api/`)
   - `operations/route.ts` — GET list, POST create
   - `operations/[id]/route.ts` — GET, PATCH, DELETE
   - `operations/[id]/members/route.ts` — GET, POST
   - `operations/[id]/members/[memberId]/route.ts` — PATCH (check-in, last-heard, team assign)
   - `operations/[id]/teams/route.ts` — GET, POST
   - `operations/[id]/teams/[teamId]/route.ts` — PATCH, DELETE
   - `operations/[id]/equipment/route.ts` — GET, POST
   - `operations/[id]/equipment/[equipId]/route.ts` — PATCH, DELETE
   - `settings/route.ts` — GET, PUT (already exists as stub)

4. **DB client** — create `lib/db.ts`:
   ```ts
   import { Pool } from 'pg';
   export const db = new Pool({ connectionString: process.env.DATABASE_URL });
   ```

5. **Migration runner** — create `lib/migrate.ts` (called once at startup via `instrumentation.ts` in Next.js 15+)

6. **Replace localStorage** in `app/operations/[id]/page.tsx`:
   - Remove all `loadIB()` / `saveIB()` / `persist()` / `IBState` localStorage logic
   - Fetch from API instead; mutations via PATCH

---

## Phase 2 — Authentication (Azure AD / MSAL.js)

**Outcome:** Team members sign in with their SEASAR Microsoft account. Role gating enforced server-side.

### Tasks

1. **Azure App Registration**
   - Register app in the SEASAR Azure AD tenant
   - Redirect URI: `https://<app>.azurewebsites.net/api/auth/callback`
   - Required env vars: `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_SECRET`

2. **Install MSAL** (already listed in `package.json` — install if not yet installed):
   ```
   npm install @azure/msal-react @azure/msal-browser
   ```

3. **Replace stub auth** — overwrite `context/auth-context.tsx`:
   - Wrap app in `MsalProvider` (in `app/layout.tsx`)
   - `useAccount()` hook replaces the stub user object
   - Server-side: validate Azure AD JWT in API routes via `jsonwebtoken` + JWKS endpoint

4. **Roles**
   - Stored in `settings` table (map Azure AD `oid` or group to role)
   - Roles: `sm` | `ops` | `planning` | `team_leader` | `searcher`
   - Default for unknown authenticated user: `searcher`
   - UI gates: SM-only tabs hidden for non-SMs (same logic as Electron `IncidentBase.tsx §14` role checks)

5. **Fallback** — email/password auth for orgs without Azure AD (Phase 6 concern; skip for now)

---

## Phase 3 — Port Operational Features

**Outcome:** The Next.js app has feature parity with the Electron app's `IncidentBase.tsx`.

Source file: `sarmanager.worktrees/copilot-worktree-2026-05-14T13-49-47/frontend/src/components/IncidentBase.tsx`

Port in this order (each can be a separate PR):

### 3a. Intake Wizard
- Source: `OperationIntake.tsx` (Electron) → `components/OperationIntake.tsx` (already exists in Next.js, verify parity)
- All 6 steps: Dispatch → Who → Where/When → Condition → Safety → Profile
- UTM input/display for PLS and LKP (use `lib/utm.ts`)
- On submit: POST to `api/operations/`, then push to `/operations/[id]`

### 3b. Overview / Board Tab
- Live member list with `memberStatus()` colour coding (green < 45 min, yellow 45–60, red > 60 — ICS standard)
- CalTopo iframe embed
- Weather widget (already exists in `api/weather/route.ts`)
- Mutual aid SAR Alberta table (hardcoded centroids + OSRM drive-time)

### 3c. Check-In Tab
- QR scan: `sar1|Name|Quals|Phone` (member card), `sar-tag|CODE` (physical tag → sar-qr-registry), `sareq1|Tag|Name|Type` (equipment)
- Manual entry with callsign auto-suggest (S1, S2…)
- D4H roster import via CSV (`parseD4HCSV()` — "Last, First" → "First Last", BOM strip, mobile > home > work priority)
- Global member registry persisted in DB (replaces `sar-global-roster` localStorage key)

### 3d. Teams Tab
- Create/edit teams with Search Type, Team Type, Notes, Assignment fields
- Assign members; drag-and-drop optional (Phase 3 bonus)

### 3e. Equipment Tab
- Full equipment list: Tag, Name, Brand, Serial, Type, Location
- Field check (records who + when)
- Assignment to team or individual
- QR scan for rapid check-in (`sareq1|...`)
- JSON bulk import
- Inline-editable Location and Serial fields

### 3f. LPB Tab
- Source: `LPBTab.tsx` (Electron)
- ISRID 15 profiles from `lib/isrid.ts`
- Probability ring distances (25/50/75/95%)
- Category-specific interview question checklists
- Team briefing template generator

### 3g. SMEAC / LICE Tab
- Source: `SmeacTab.tsx` (Electron)
- Auto-populate from operation data
- Copy-to-clipboard button

### 3h. Weather Tab
- Already partially exists in `api/weather/route.ts`
- Wire up frontend component; display current + 3-day forecast
- EC weather alerts for Alberta from `dd.weather.gc.ca`

### 3i. Push Update D4H Tab
- POST log entry to D4H incident via `api/d4h/route.ts`
- Quick-fill templates

### 3j. Second Callout Tab
- Follow-up D4H/Twilio callout
- Live response tracker (polling D4H responses endpoint)

### 3k. Operation Edit Tab
- Edit subject details, clothing, medical, safety, PLS/LKP after initial intake

### 3l. Incident Report Export
- Generate structured plain-text document from DB data
- Sections: subject, teams, equipment log, attendance, SMEAC, callout summary
- Download as `.txt`

---

## Phase 4 — Real-Time Sync

**Outcome:** All connected devices see updates within ~1 second without full page reload.

### Tasks

1. **Choose transport**
   - **Server-Sent Events (SSE)** — simpler, works through Azure App Service without WebSocket upgrade config. Good for board → read-only clients.
   - **Socket.io** — bidirectional, required if clients push updates (check-in, last-heard pings). Recommended.

2. **Socket.io setup**
   - Install: `npm install socket.io socket.io-client`
   - Create custom Next.js server (`server.ts`) that attaches Socket.io to the HTTP server
   - Room per operation: `operation:{id}`
   - Events to broadcast:
     - `member:update` — check-in, last-heard, team assign
     - `team:update` — create/edit/delete team
     - `equipment:update` — field check, assignment change
     - `operation:update` — status change, D4H/CalTopo IDs
   - On any DB write in an API route, emit the corresponding event to the operation room

3. **Client integration**
   - `hooks/useSocket.ts` — connect on mount, join room, listen for events, update local React state
   - Optimistic updates: apply to local state immediately, confirmed by server broadcast

---

## Phase 5 — Mobile Searcher View

**Outcome:** Team members can check in, view their assignment, and sign out gear from their phone.

### Tasks

1. **`SearcherPortal` component** — port from Electron worktree
   - Mobile-first (full-bleed, large touch targets)
   - Route: `/operations/[id]/searcher`
   - Auto-redirect here if role = `searcher` or `team_leader`

2. **Flows**
   - Check in (QR or manual)
   - View current team assignment + task notes
   - View personal gear assignment
   - Last-heard self-ping (sends `member:lastHeard` socket event)
   - Check out

3. **QR entry point**
   - Operation page displays QR code for `https://<app>/operations/[id]/searcher`
   - Team members scan at the command post to go directly to their view

---

## Phase 6 — Multi-Tenancy

**Outcome:** Multiple SAR organizations can use the same deployment with isolated data.

**Design decisions to make before starting:**
- Row-level org isolation: every query includes `WHERE org_id = $orgId` (enforced in a helper, not per-route)
- Azure AD: each org registers their own tenant ID; stored in `organizations.azure_tenant_id`
- Onboarding flow: new org signs up → creates org row → first user becomes admin → configures settings

### Tasks

1. Add `azure_tenant_id` to `organizations` table
2. Validate JWT tenant against `organizations` table on every authenticated request
3. Create `app/onboarding/` wizard (org name → Azure tenant → D4H token → CalTopo creds)
4. Admin role per org for settings management

---

## Deployment Architecture (Target State)

```
Azure Static Web Apps (optional CDN layer)
        ↕ HTTPS
Azure App Service (Next.js — server-side rendering + API routes)
        ↕ pg
Azure Database for PostgreSQL Flexible Server
        ↕ (real-time)
Socket.io rooms (co-located with App Service; scale with sticky sessions or Redis adapter)
```

**Environment variables required:**
```
DATABASE_URL=postgresql://...
AZURE_AD_CLIENT_ID=...
AZURE_AD_TENANT_ID=...
AZURE_AD_CLIENT_SECRET=...
NEXTAUTH_SECRET=...   (if using next-auth as a wrapper)
D4H_API_URL=https://api.team-manager.ca.d4h.com/v3
CALTOPO_BASE_URL=https://caltopo.com
```

**Deployment command (existing `install/azure.ps1`):**
```powershell
.\install\azure.ps1 -AppName sarmanager -Sku B1
```

---

## Key Decisions Log

| Decision | Choice | Reason |
|---|---|---|
| Auth provider | Azure AD (MSAL.js) | SEASAR already has Microsoft 365 / Entra ID |
| Database | PostgreSQL (Azure Flexible Server) | Structured relational data; `pg` already in package.json |
| Real-time | Socket.io | Bidirectional needed for last-heard pings from searchers |
| Multi-tenancy | Row-level org isolation | Simpler than schema-per-org; easier backups and migrations |
| Coordinate display | UTM always | SEASAR standard; never show decimal degrees in UI |
| Mobile entry point | QR code per operation | Zero install; team members open URL from scan |

---

## Phase Order Summary

| Phase | Deliverable | Prerequisite |
|---|---|---|
| 1 | PostgreSQL schema + API routes | — |
| 2 | Azure AD authentication | Phase 1 (need user → org mapping) |
| 3 | Operational features ported | Phase 1 + 2 |
| 4 | Real-time sync | Phase 3 (need events to broadcast) |
| 5 | Mobile Searcher view | Phase 3 (need member/team/equipment APIs) |
| 6 | Multi-tenancy | Phase 1–5 stable |

---

*Last updated: 2026-05-26. Source of truth for ported features: `sarmanager.worktrees/copilot-worktree-2026-05-14T13-49-47/frontend/src/components/IncidentBase.tsx` (§1–§16, fully indexed and commented).*
