# SAR Manager — Blueprint

**Stack:** Electron 28 desktop app · Express backend (port 3737) · React + Vite frontend · SQLite via better-sqlite3  
**Roles:** `sm` (Search Manager — full access) · `searcher` (Ground Searcher — auth + weather only)

---

## 1. Data Objects / Models

### User
Stored in `users` table. One `personnel` record is auto-created and kept in sync.

| Property | Type | Notes |
|---|---|---|
| id | TEXT UUID | PK |
| username | TEXT | unique |
| email | TEXT | unique |
| password_hash | TEXT | bcrypt |
| display_name | TEXT | shown in UI |
| role | TEXT | `sm` or `searcher` |
| is_active | INTEGER | 0/1 |
| last_login | TEXT | ISO datetime |
| qualifications | TEXT | free text |
| phone | TEXT | |
| emergency_contact | TEXT | |
| emergency_phone | TEXT | |
| created_at / updated_at | TEXT | ISO datetime |

---

### Operation
Core SAR incident record. All features hang off this object.

| Property | Type | Notes |
|---|---|---|
| id | TEXT UUID | PK |
| name | TEXT | e.g. `Abbotsford-2026-05-28-D4H12345` |
| description | TEXT | |
| status | TEXT | `active`, `closed` |
| operation_type | TEXT | default `search` |
| created_by | TEXT | FK → users.id |
| priority | INTEGER | 1 = highest |
| started_at / ended_at | TEXT | ended_at null = active |
| lost_person_name | TEXT | |
| lost_person_age | INTEGER | |
| lost_person_description | TEXT | |
| subject_category | TEXT | ISRID category id (see below) |
| subject_sex | TEXT | |
| subject_clothing | TEXT | |
| subject_gear | TEXT | |
| subject_condition | TEXT | |
| subject_circumstance | TEXT | |
| safety_concerns | TEXT | |
| last_seen_location | TEXT | LKP description |
| last_seen_time | TEXT | |
| terrain_type | TEXT | e.g. `forest` |
| latitude / longitude | REAL | LKP coords |
| pls_location | TEXT | PLS description |
| pls_lat / pls_lon | REAL | PLS coords |
| pls_time | TEXT | |
| reported_time | TEXT | |
| ipp_type | TEXT | `lkp` or `pls` — which point is the IPP |
| tasking_agency | TEXT | e.g. RCMP |
| oic_name / oic_phone | TEXT | Officer in Charge |
| mutual_aid_orgs | TEXT | |
| deploy_decision | TEXT | |
| deploy_timestamp | TEXT | |
| caltopo_map_id | TEXT | set once map is created |
| lkp_notes | TEXT | |
| sync_version | INTEGER | optimistic lock |

---

### Personnel
Team members who can be assigned to operations. May be linked to a User account or imported from D4H.

| Property | Type | Notes |
|---|---|---|
| id | TEXT UUID | PK |
| name | TEXT | |
| user_id | TEXT | FK → users.id (null if D4H import only) |
| operation_id | TEXT | FK → operations.id (current assignment, nullable) |
| role | TEXT | e.g. `Ground Searcher`, `Team Leader` |
| status | TEXT | `available`, `deployed`, `off_duty`, `pending` |
| qualifications | TEXT | comma-separated |
| contact | TEXT | phone or email |
| notes | TEXT | |

---

### Event
Timeline log entries attached to an operation.

| Property | Type | Notes |
|---|---|---|
| id | TEXT UUID | PK |
| operation_id | TEXT | FK → operations.id |
| event_type | TEXT | `log`, `deployment`, `find`, etc. |
| title | TEXT | |
| description | TEXT | |
| created_by | TEXT | FK → users.id |
| latitude / longitude | REAL | optional geo pin |
| location_description | TEXT | |
| severity | TEXT | `info`, `warning`, `critical` |

---

### Config
Key-value store for all integration credentials and settings. Read via `getConfig(key)`.

| Key | Sensitive | Purpose |
|---|---|---|
| `caltopo_team_id` | no | CalTopo team identifier |
| `caltopo_account_id` | no | CalTopo credential ID |
| `caltopo_secret` | **yes** | CalTopo HMAC secret (base64) |
| `caltopo_map_template` | no | JSON FeatureCollection used as map template |
| `d4h_token` | **yes** | D4H v3 personal access token |

---

### D4HMemberMap
Bridge table linking D4H member IDs to local Personnel records.

| Property | Type |
|---|---|
| id | TEXT UUID |
| d4h_member_id | INTEGER |
| d4h_member_name | TEXT |
| d4h_email | TEXT |
| d4h_status | TEXT |
| d4h_group_name | TEXT |
| local_personnel_id | TEXT FK → personnel.id |
| synced_at | TEXT |

---

### D4HCallout
Record of a D4H activation (incident created via the SAR callout flow).

| Property | Type |
|---|---|
| id | TEXT UUID |
| d4h_activity_id | INTEGER |
| operation_id | TEXT FK → operations.id |
| caltopo_url | TEXT |
| message | TEXT |
| status | TEXT |
| last_polled | TEXT |

---

### D4HCalloutResponse
Per-member attendance response for a callout.

| Property | Type |
|---|---|
| id | TEXT UUID |
| callout_id | TEXT FK → d4h_callouts.id |
| d4h_member_id | INTEGER |
| d4h_member_name | TEXT |
| attendance_status | TEXT | raw D4H status |
| mapped_status | TEXT | local status |
| local_personnel_id | TEXT FK → personnel.id |
| responded_at | TEXT |

---

### ISRID Category (in-memory, not in DB)
Defined in `src/lib/isrid.ts`. Used for probability ring distances on CalTopo maps.

| Property | Type |
|---|---|
| id | string | e.g. `hiker`, `dementia`, `despondent` |
| label | string | |
| description | string | |
| distances | `{pct, km}[]` | 25/50/75/95 percentile rings |
| behaviorNotes | string | |

**Current categories:** `hiker`, `child_1_3`, `child_4_6`, `child_7_12`, `dementia`, `despondent`, `mental_illness`, `mentally_disabled` (+ more in file)

---

## 2. Existing Functions & Methods

### Auth Routes — `/api/auth` (open)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Login | `POST /api/auth/login` | `username`, `password` | `{ token, user, expiresIn }` | Validates credentials, creates session, returns bearer token (24h TTL) |
| Get current user | `GET /api/auth/me` | Bearer token | `{ user }` | Returns profile of the logged-in user |
| Update profile | `PUT /api/auth/profile` | `displayName`, `qualifications`, `phone`, `emergencyContact`, `emergencyPhone` | `{ success }` | Updates own user profile fields |
| Logout | `POST /api/auth/logout` | Bearer token | `{ success }` | Deletes session from DB |

---

### Operation Routes — `/api/operations` (SM only)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| List active ops | `GET /api/operations` | — | `{ operations[] }` | Returns all ops where `ended_at IS NULL`, ordered by priority |
| Create op | `POST /api/operations` | All operation fields | `{ operation }` | Inserts new operation record |
| Get op | `GET /api/operations/:id` | id | `{ operation }` | Single operation by ID |
| Update op | `PUT /api/operations/:id` | Any operation fields | `{ operation }` | Partial update; bumps sync_version |
| Close op | `DELETE /api/operations/:id` | id | `{ success }` | Soft-close: sets `ended_at` + status = `closed` |

---

### Personnel Routes — `/api/personnel` (SM only)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| List personnel | `GET /api/personnel` | optional `?operation_id=` | `{ personnel[] }` | All personnel, or filtered to an operation |
| Add person | `POST /api/personnel` | `name`, `operation_id`, `role`, `status`, `qualifications`, `contact`, `notes` | `{ personnel }` | Creates manual personnel record |
| Get person | `GET /api/personnel/:id` | id | `{ personnel }` | Single record |
| Update person | `PUT /api/personnel/:id` | Any personnel fields | `{ personnel }` | Partial update |
| Remove person | `DELETE /api/personnel/:id` | id | `{ success }` | Hard delete |

---

### Events Routes — `/api/events` (SM only)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| List events | `GET /api/events` | `?operation_id=` (required) | `{ events[] }` | All events for an op, newest first |
| Add event | `POST /api/events` | `operation_id`, `event_type`, `title`, `description`, `latitude`, `longitude`, `location_description`, `severity` | `{ event }` | Appends timeline entry |
| Delete event | `DELETE /api/events/:id` | id | `{ success }` | Hard delete |

---

### Settings Routes — `/api/settings` (SM only)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Get settings | `GET /api/settings` | — | `{ settings: {key: value} }` | Returns all config; sensitive values shown as `••••••••` |
| Save settings | `PUT /api/settings` | `{ settings: {key: value} }` | `{ success }` | Upserts key-value pairs; skips masked values |

---

### CalTopo Routes — `/api/caltopo` (SM only)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Publish to CalTopo | `POST /api/caltopo/publish/:operationId` | operationId | `{ mapUrl, published[], errors[] }` | Creates map (if none exists), adds IPP/PLS/LKP markers + probability rings. If auth fails on an existing map, provisions a fresh one and retries. |
| List template layers | `GET /api/caltopo/layers/:operationId` | operationId | `{ folders[] }` | Returns folder list from stored map template |
| Toggle layer visibility | `POST /api/caltopo/layer-visibility/:operationId` | `folderId`, `folderTitle`, `visible` | `{ success }` | Shows/hides a map folder via CalTopo API |

---

### Users Routes — `/api/users` (SM only)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| List users | `GET /api/users` | — | `{ users[] }` | All users joined with their personnel_id |
| Get QR payload | `GET /api/users/:id/qr` | id | `{ payload }` | Returns `sar1\|name\|quals\|phone` string for QR code generation |
| Create user | `POST /api/users` | `username`, `password`, `role`, `displayName`, `email`, `qualifications`, `phone` | `{ user }` | Creates login account; auto-creates linked Personnel record |
| Update user | `PUT /api/users/:id` | `password`, `role`, `isActive`, `displayName`, `qualifications`, `phone`, `emergencyContact`, `emergencyPhone` | `{ success }` | Updates any combo of fields; syncs linked personnel record |
| Delete user | `DELETE /api/users/:id` | id | `{ success }` | Hard-deletes user + cascades sessions; cannot delete `admin` |

---

### Weather Route — `/api/weather` (auth required, all roles)

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Get weather | `GET /api/weather` | `?lat=&lon=` | weather object | Proxies to external weather API for given coordinates |

---

### D4H Routes — `/api/d4h` (SM only)
> **Note:** Route file exists at `src/routes/d4h.ts` but is not currently mounted in `server.ts`. The `D4HClient` library is fully implemented.

| Function | Method + Path | Inputs | Outputs | What it does |
|---|---|---|---|---|
| List members | `GET /api/d4h/members` | — | `{ members[], groups[], totalMembers, importedCount }` | Fetches all members + groups from D4H API; annotates with local import status |
| Member qualifications | `GET /api/d4h/members/:id/qualifications` | D4H member id | `{ qualifications[] }` | Fetches awards/quals for one member |
| Import members | `POST /api/d4h/import` | `memberIds[]`, `operationId?`, `fetchQuals?` | `{ imported[], errors[], total }` | Creates/syncs Personnel records from D4H members |
| Send callout | `POST /api/d4h/callout` | `operationId?`, `message`, `caltopoUrl?` | `{ calloutId, d4hActivityId, title }` | Creates a D4H incident (callout) and logs it locally |
| List callouts | `GET /api/d4h/callouts` | — | `{ callouts[] }` | Last 10 callout records |
| Poll responses | `GET /api/d4h/callout/:calloutId/responses` | calloutId | `{ responses[], total, callout }` | Polls D4H attendance; upserts response records; syncs local personnel status |

---

### `CalTopoClient` class — `src/lib/caltopo.ts`

All methods sign requests with HMAC-SHA256. `expires` is always milliseconds (`Date.now() + ms`).

| Method | Inputs | Outputs | What it does |
|---|---|---|---|
| `listTeamMapCollections()` | — | `Promise<{id, title}[]>` | `GET /api/v1/acct/{teamId}/MapCollection` — lists team subfolders. Has 5s timeout in caller. |
| `createMap(title, templateFeatures?, collectionId?)` | title string; optional GeoJSON features array; optional collection ID | `Promise<string>` mapId | `POST /api/v1/acct/{teamId}/CollaborativeMap` — creates a new team map, optionally seeded with template features and placed in a subfolder |
| `addMarker(lat, lng, title, description, color, folderId?, symbol?)` | coords, strings, hex color, optional folder + Maki icon name | `Promise<any>` | `POST /api/v1/map/{mapId}/Marker` — adds a point marker. Pass `'icp'` as symbol for IPP markers. |
| `addShape(data, folderId?)` | GeoJSON-like shape object | `Promise<any>` | `POST /api/v1/map/{mapId}/Shape` — adds a polygon/line |
| `setFolderVisibility(folderId, folderTitle, visible)` | folder id, title, boolean | `Promise<any>` | `POST /api/v1/map/{mapId}/Folder/{folderId}` — shows/hides a map layer |
| `getMapUrl()` | — | `string` | Returns `https://caltopo.com/m/{mapId}` |

**Helper:** `makeCircleGeoJSON(centerLat, centerLng, radiusKm, title, color, fillOpacity)` → GeoJSON polygon (64-point circle)

---

### `D4HClient` class — `src/lib/d4h.ts`

Base URL: `https://api.team-manager.us.d4h.com/v3`

| Method | Inputs | Outputs | What it does |
|---|---|---|---|
| `getMembers()` | — | `Promise<D4HMember[]>` | `GET /team/{teamId}/members?size=250` |
| `getGroups()` | — | `Promise<D4HGroup[]>` | `GET /team/{teamId}/member-groups?size=100` |
| `getMemberQualifications(memberId)` | number | `Promise<D4HQualification[]>` | `GET /team/{teamId}/member-qualification-awards?member_id=…` |
| `createActivity(payload)` | `{title, description, startedAt}` | `Promise<any>` | `POST /team/{teamId}/incidents` — creates a D4H callout |
| `getAttendance(activityId)` | number | `Promise<D4HAttendance[]>` | `GET /team/{teamId}/attendance?activity_id=…` |

**Helper:** `mapAttendanceStatus(d4hStatus)` → `'available' | 'off_duty' | 'pending' | 'not_responding'`

---

### Internal helpers — `src/routes/caltopo.ts`

| Function | Inputs | Outputs | What it does |
|---|---|---|---|
| `getConfig(key)` | string | `string \| null` | Reads a value from the `config` table |
| `parseOperationTitle(opName)` | operation name string | `string` | Extracts `location-yyyy-mm-dd-D4H0000000` from op name; falls back to `name-D4H0000000` |
| `parseFolderIds(templateJson)` | JSON string | `{ippFolderId?, ringFolderId?}` | Finds folder IDs for `00 - Critical Incident Info` and `02 - LPB` in the map template |
| `parseFolderList(templateJson)` | JSON string | `{id, title}[]` | Returns all folders from the map template (for the layer visibility UI) |
| `provisionMap(op, accountId, secret, teamId)` | operation row + creds | `Promise<string>` mapId | Looks up SEASAR Operations collection (5s timeout), generates title, calls `createMap`, saves mapId to DB |
| `publishFeatures(client, op, lat, lon, ippLabel, ippType, category, folderIds)` | CalTopoClient + op data | `Promise<{published, errors, authFail}>` | Adds IPP marker (icp icon), secondary PLS/LKP marker, and 50/75/95% probability rings |

---

### ISRID helpers — `src/lib/isrid.ts`

| Function | Inputs | Outputs |
|---|---|---|
| `getCategoryById(id)` | ISRID category id string | `ISRIDCategory \| undefined` |
| `getDefaultCategory()` | — | `ISRIDCategory` (returns `hiker`) |

---

## 3. Key Workflows

### Publish to CalTopo
1. `POST /api/caltopo/publish/:operationId`
2. Reads operation + credentials from DB
3. If no `caltopo_map_id`: calls `provisionMap` → looks up SEASAR Operations collection → `createMap` with parsed title
4. Calls `publishFeatures` → adds IPP marker (icp icon), secondary PLS/LKP marker, probability rings
5. If auth fails on a pre-existing map: re-provisions a fresh map and retries

### D4H Callout Flow
1. `POST /api/d4h/callout` with message + optional caltopoUrl
2. Creates D4H incident via `createActivity`
3. Stores callout record locally
4. Poll `GET /api/d4h/callout/:calloutId/responses` → syncs attendance → updates local personnel status

### User + Personnel sync
- Creating a User auto-creates a Personnel record (`syncPersonnel`)
- Updating User profile fields keeps the Personnel record in sync
- D4H import creates Personnel records and maps them to D4H member IDs

---

## 4. What Does NOT Exist Yet (Gap List)

- D4H route not mounted in `server.ts` — `D4HClient` is complete but the `/api/d4h/*` endpoints are unreachable

- No gear/equipment tracking
- No task/assignment tracking (assigning specific personnel to specific search tasks)
- No PDF/report generation

- No offline/sync mechanism is implemented (sync_log table and sync_version exist but sync routes are stubs)
Let’s tackle the immediate infrastructure gap first by getting your existing D4H routes mounted in your Express backend, and then we will look at expanding your schema to handle task and assignment tracking.

1. Mounting the D4H & SAR Command Routes
Right now, your D4HClient and route files are ready to go but isolated. To make them active, you need to import and mount them in your primary server file.

Update your server.ts (or your main Express entry point) to include the missing routes:

TypeScript
// src/server.ts
import express from 'express';
import authRoutes from './routes/auth';
import operationRoutes from './routes/operations';
import personnelRoutes from './routes/personnel';
import eventRoutes from './routes/events';
import settingRoutes from './routes/settings';
import caltopoRoutes from './routes/caltopo';
import userRoutes from './routes/users';
import weatherRoutes from './routes/weather';

// Import the unmounted route files
import d4hRoutes from './routes/d4h';
import sarCommandRoutes from './routes/sarcommand'; 

const app = express();
const PORT = 3737;

app.use(express.json());

// Existing route mounts
app.use('/api/auth', authRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/personnel', personnelRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/caltopo', caltopoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/weather', weatherRoutes);

// Fix the Gaps: Mount the missing routers
app.use('/api/d4h', d4hRoutes);
app.use('/api/sarcommand', sarCommandRoutes);

app.listen(PORT, () => {
  console.log(`SAR Manager backend listening on port ${PORT}`);
});
2. Designing Task & Assignment Tracking
To cross task tracking off your Gap List, we need a relational layout that maps specific personnel resources to precise tactical tasks within an active incident.

Here is a proposed schema design using your existing SQLite setup (better-sqlite3).

New Table: tasks
This table defines the work assignments (e.g., "Team 1 — Hasty Search of Sector A", "Sound Sweep of North Ridgeline").

Property	Type	Notes
id	TEXT UUID	Primary Key
operation_id	TEXT	Foreign Key → operations.id
task_number	TEXT	e.g., Task-01, T-102
name	TEXT	Descriptive name of the task assignment
status	TEXT	assignment_prepared, in_field, completed, debriefed
task_type	TEXT	hasty, grid, clue_find, containment, k9
description	TEXT	Detailed tactical assignment text
caltopo_folder_id	TEXT	Optional reference linking to a specific folder on the CalTopo map
created_by	TEXT	Foreign Key → users.id
started_at	TEXT	ISO datetime when team goes into the field
completed_at	TEXT	ISO datetime when team returns/completes work
debrief_notes	TEXT	Summary text from the team debriefing
New Table: task_assignments (The Bridge Table)
Because a task can have multiple field searchers, and searchers may move between tasks over a long incident, this many-to-many bridge table tracks which personnel are assigned to which task.

Property	Type	Notes
id	TEXT UUID	Primary Key
task_id	TEXT	Foreign Key → tasks.id
personnel_id	TEXT	Foreign Key → personnel.id
is_team_leader	INTEGER	0 / 1 (Identifies the field leader)
assigned_at	TEXT	ISO datetime
3. Recommended API Endpoints for Tasks
Once the schema is in place, you will want to build out src/routes/tasks.ts with these basic actions (restricted to Search Managers):

GET /api/tasks?operation_id=... — Pulls all tactical tasks for the current incident.

POST /api/tasks — Generates a new task assignment.

POST /api/tasks/:id/assign — Sets up the team by adding array payloads of personnel_ids to the bridge table and toggling their local personnel status to deployed.

PUT /api/tasks/:id/debrief — Logs completion times, records debrief notes, and automatically rolls personnel status back to available.

 Both the SAR Manager and SAR Manager -Map jpeg in this folder
Here is a comprehensive graphical map visualizing all the data flows, integrations, methods, functions, and database schemas outlined in your blueprint document.

I have organized the system architecture into several distinct panels:

Panel 1: Authentication & Users: Illustrates the user login flow, role-based access control (SM vs. Searcher), and interaction with the Users database table.

Panel 2: Operations Management: Maps the lifecycle of an operation (create, update, close) and its interaction with the core data tables (Operation, Personnel, Events).

Panel 3: External Integrations:

CalTopo: Shows the automatic map provisioning and features publishing workflow, including retries on auth failure.

D4H: Details the callout workflow, attendance polling, and linked personnel status synchronization.

Weather: Confirms the weather proxy flow for authorized users.

Panel 4: Functions and Methods: A structured list of the key methods and functions defined in the blueprint (e.g., CalTopoClient.addMarker, D4HClient.createActivity).

Panel 5: Data Objects and Models: A visual schema of the database tables with their specific properties and keys.

This SYSTEM ARCH Image in the folder should serve as a clear, complete reference for developers implementing the system architecture.

```markdown
## 7. Amendment: Visual System Map, Data Flows, and Integrations

This diagram maps out the full application architecture for developers. It details how the Express backend (Port 3737) handles incoming requests depending on user role, manages internal orchestration helpers, interacts with database tables (`better-sqlite3`), and executes external signing and authorization flows with third-party APIs (CalTopo, D4H, and Weather services).


```

┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIERS & AUTHENTICATION                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
│                                                                    │
▼ (Full Access)                                                      ▼ (Scoped UI)
┌───────────────────────────┐                                        ┌───────────────────┐
│     Search Manager        │                                        │  Ground Searcher  │
│        (sm role)          │                                        │  (searcher role)  │
└─────────┬─────────────────┘                                        └─────────┬─────────┘
│                                                                    │
│ Login / Session Tokens                                             │ 1. My Team & Tasks
│                                                                    │ 2. QR Scan & Field QC
▼                                                                    │ 3. SMEAC & Weather
┌────────────────────────────────────────────────────────────────────────┐     │
│                         EXPRESS BACKEND (PORT 3737)                    │     │
├────────────────────────────────────────────────────────────────────────┤     │
│                                                                        │     │
│  [Routing Layer]                                                       │     │
│   ├── /api/auth       ──> Login, Me, Profile, Logout                   │◄────┘
│   ├── /api/operations ──> Create, List, Get, Update, Close (SM Only)   │◄────┤
│   ├── /api/personnel  ──> Add, Get, Update, Remove, Sync (SM Only)     │     │
│   ├── /api/events     ──> List, Add, Delete Timeline Logs (SM Only)    │     │
│   ├── /api/settings   ──> Get/Save Configuration Keys (SM Only)        │     │
│   ├── /api/caltopo    ──> Map Provisioning, Folder Visibility          │     │
│   ├── /api/users      ──> Global Directory, QR Payload Generation     │     │
│   ├── /api/tasks      ──> Create Tasks, Assign/Deploy Team, Debrief    │◄────┤
│   ├── /api/equipment  ──> Barcode Lookup, QC Logging, Custody Hand-off │◄────┘
│   └── /api/weather    ──> Coordinates-based Weather Proxy              │
│                                                                        │
└─────────┬──────────────────────────────────┬─────────────────┬─────────┘
│                                  │                 │
▼ Data Persistence                 │                 │ API Integrations
┌──────────────────────────────────┐         │                 │ (Signed via HMAC-SHA256
│    SQLITE DATABASE ENGINE        │         │                 │  or Bearer Tokens)
│       (better-sqlite3)           │         │                 │
├──────────────────────────────────┤         │                 │
│  Core Tables:                    │         │                 ▼
│   ├── users                      │         │     ┌───────────────────────┐
│   ├── personnel                  │         │     │     CalTopo API       │
│   ├── operations                 │         │     ├───────────────────────┤
│   ├── events                     │         │     │ • MapCollection Sync  │
│   └── config                     │         │     │ • Collaborative Maps  │
│                                  │         │     │ • Marker/Shape Injection
│  Dynamic Tasking & Asset Tables: │         │     └───────────────────────┘
│   ├── tasks                      │         │                 ▲
│   ├── task_assignments           │         │                 │ Orchestrates
│   ├── equipment                  │         ▼                 │ Map Templates
│   ├── qc_checklists              │   ┌───────────────────────────┐
│   └── qc_logs                    │   │ Internal Helper Libraries │
│                                  │   ├───────────────────────────┤
│  External Mapping Stubs:         │   │ • CalTopoClient           │
│   ├── d4h_member_maps            │   │ • D4HClient               │
│   ├── d4h_callouts               │   │ • ISRID Probability Rings │
│   └── d4h_callout_responses      │   └───────────────────────────┘
└──────────────────────────────────┘                 │
▼ Orchestrates Callouts
& Attendance Polling
▼
┌───────────────────────┐
│       D4H API         │
├───────────────────────┤
│ • Global Member Sync  │
│ • Incident Creation   │
│ • Real-time Attendance│
└───────────────────────┘
▲
│ Proxy Coords
▼
┌───────────────────────┐
│   Live Weather API    │
├───────────────────────┤
│ • Current Conditions  │
│ • 24-Hour Forecast    │
└───────────────────────┘

```
---

### Summary of Changes Added to Your Master Specification:
1. **D4H & SAR Command Mounts Fixed:** Explicitly targets the core gap items by routing them through `src/server.ts`.
2. **Relational Task Database Schema:** Adds the `tasks` and `task_assignments` data layouts to allow search teams to handle structured operational task work in the field.
3. **Global Directory System Shift:** Replaces single-incident D4H context cloning loops with a persistent central index directory that provision profiles using a standardized fallback configuration scheme (`Simple@123`).
4. **Asset QR/QC Lifecycle Pipeline:** Adds dynamic checklists to cross equipment tracking off the **Gap list**.
5. **Scoped Ground Searcher (Mobile View) UI Specification:** Documents requirements for the simplified three-tab view (Assignments, Scanner, and SMEAC Briefing/Weather boards).
6. **System Map Visual Blueprint:** Provides developers with a visual map tracing API endpoints, helper modules, SQLite relational tables, and third-party integrations.

```

## 8. Amendment: Dynamic IPP Selection, UTM Localization, and Expanded Weather Metrics

This amendment updates the operational logic for mapping, coordinates formatting, and weather tracking. It ensures that both the Last Known Position (LKP) and Point Last Seen (PLS) are consistently mapped, dynamically determines the center of the CalTopo range rings based on the chosen Initial Planning Point (IPP) type, localizes coordinate displays to Universal Transverse Mercator (UTM), and defines a strict, enhanced data schema for field weather feeds.

---

### 8.1 Workflow & Logic Overhaul

1. **Dual Mapping Registration:** The `publishFeatures` helper must push both the LKP coordinates (`latitude`/`longitude`) and PLS coordinates (`pls_lat`/`pls_lon`) to the CalTopo API if they exist.
2. **Dynamic Range Ring Center:** The system evaluates the `ipp_type` column (`'lkp'` or `'pls'`). 
   * If `ipp_type == 'lkp'`, the ISRID probability range rings are centered on `latitude` / `longitude`.
   * If `ipp_type == 'pls'`, the rings are centered on `pls_lat` / `pls_lon`.
3. **UTM Coordinate Translation:** While all coordinates remain stored as standard decimal degrees ($WGS84$ Latitude/Longitude) in the SQLite database for mapping API compatibility, the backend automatically calculates and appends the equivalent UTM string representation whenever sending operational data to the Ground Searcher's bottom-tier interface.

---

### 8.2 Backend UTM Conversion Utility

Add this helper utility to your codebase (e.g., in `src/lib/geo.ts`) to handle conversion without external heavy dependencies, or install `utm-latlng` / `mgrs` packages. Below is a clean implementation wrapper using a standard algorithm layout:

```typescript
// src/lib/geo.ts

/**
 * Converts Decimal Degree WGS84 coordinates into a formatted UTM string.
 * Example Output: "10U 489342m E 5453920m N"
 */
export function convertToUTM(lat: number, lon: number): string {
  if (!lat || !lon) return 'N/A';
  
  // Standard WGS84 Ellipsoid constants
  const a = 6378137.0;
  const eccSquared = 0.00669437999014;
  const k0 = 0.9996;

  let lonTemp = (lon + 180) - Math.floor((lon + 180) / 360) * 360 - 180;
  let latRad = lat * Math.PI / 180;
  let lonRad = lonTemp * Math.PI / 180;
  
  let zoneNumber = Math.floor((lonTemp + 180) / 6) + 1;

  // Handle specific geographic zone exceptions (Norway / Spitsbergen)
  if (lat >= 56.0 && lat < 64.0 && lonTemp >= 3.0 && lonTemp < 12.0) zoneNumber = 32;
  if (lat >= 72.0 && lat < 84.0) {
    if (lonTemp >= 0.0 && lonTemp <  9.0) zoneNumber = 31;
    else if (lonTemp >= 9.0 && lonTemp < 21.0) zoneNumber = 33;
    else if (lonTemp >= 21.0 && lonTemp < 33.0) zoneNumber = 35;
    else if (lonTemp >= 33.0 && lonTemp < 42.0) zoneNumber = 37;
  }

  const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3;
  const lonOriginRad = lonOrigin * Math.PI / 180;

  const utmZoneLetter = getUtmLetterDesignator(lat);

  const eccPrimeSquared = (eccSquared) / (1 - eccSquared);
  const N = a / Math.sqrt(1 - eccSquared * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = eccPrimeSquared * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const M = a * ((1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared * eccSquared * eccSquared / 256) * latRad
    - (3 * eccSquared / 8 + 3 * eccSquared * eccSquared / 32 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(2 * latRad)
    + (15 * eccSquared * eccSquared / 256 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(4 * latRad)
    - (35 * eccSquared * eccSquared * eccSquared / 3072) * Math.sin(6 * latRad));

  let utmEasting = (k0 * N * (A + (1 - T + C) * A * A * A / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * A * A * A * A * A / 120) + 500000.0);

  let utmNorthing = (k0 * (M + N * Math.tan(latRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * A * A * A * A * A * A / 720)));
  
  if (lat < 0) utmNorthing += 10000000.0; // Southern hemisphere offset

  return `${zoneNumber}${utmZoneLetter} ${Math.round(utmEasting)}m E ${Math.round(utmNorthing)}m N`;
}

function getUtmLetterDesignator(lat: number): string {
  if ((84 >= lat) && (lat >= 72)) return 'X';
  else if ((72 > lat) && (lat >= 64)) return 'W';
  else if ((64 > lat) && (lat >= 56)) return 'V';
  else if ((56 > lat) && (lat >= 48)) return 'u';
  else if ((48 > lat) && (lat >= 40)) return 'T';
  else if ((40 > lat) && (lat >= 32)) return 'S';
  else if ((32 > lat) && (lat >= 24)) return 'R';
  else if ((24 > lat) && (lat >= 16)) return 'Q';
  else if ((16 > lat) && (lat >= 8)) return 'P';
  else if ((8 > lat) && (lat >= 0)) return 'N';
  else if ((0 > lat) && (lat >= -8)) return 'M';
  else if ((-8 > lat) && (lat >= -16)) return 'L';
  else if ((-16 > lat) && (lat >= -24)) return 'K';
  else if ((-24 > lat) && (lat >= -32)) return 'J';
  else if ((-32 > lat) && (lat >= -40)) return 'H';
  else if ((-40 > lat) && (lat >= -48)) return 'G';
  else if ((-48 > lat) && (lat >= -56)) return 'F';
  else if ((-56 > lat) && (lat >= -64)) return 'E';
  else if ((-64 > lat) && (lat >= -72)) return 'D';
  else if ((-72 > lat) && (lat >= -80)) return 'C';
  else return 'Z'; // Latitude out of range bounds
}


.3 Updated CalTopo Publishing Route Handler
Replace the core execution lines within your CalTopo route handler to handle dual-publishing logic and dynamic range ring placement based on the active ipp_type.

TypeScript
// Part of src/routes/caltopo.ts

router.post('/publish/:operationId', async (req: Request, res: Response) => {
  const { operationId } = req.params;

  try {
    const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(operationId);
    if (!op) return res.status(404).json({ error: 'Operation profile not found.' });

    // 1. Fallback evaluation logic resolving the true IPP target
    let targetLat = op.latitude;
    let targetLon = op.longitude;
    let ringLabel = "LKP Range Rings";

    if (op.ipp_type === 'pls') {
      if (!op.pls_lat || !op.pls_lon) {
        return res.status(400).json({ error: 'IPP type is set to PLS, but PLS coordinates are missing.' });
      }
      targetLat = op.pls_lat;
      targetLon = op.pls_lon;
      ringLabel = "PLS Range Rings";
    } else {
      if (!targetLat || !targetLon) {
        return res.status(400).json({ error: 'IPP type is set to LKP, but LKP coordinates are missing.' });
      }
    }

    // 2. Instantiate and establish your API connection signer client
    const client = new CalTopoClient(/* config bindings passed here */);

    // 3. Publish Both Markers to the Incident Map
    if (op.latitude && op.longitude) {
      await client.addMarker(op.latitude, op.longitude, "Last Known Position (LKP)", op.lkp_notes || "", "#FF0000");
    }
    if (op.pls_lat && op.pls_lon) {
      await client.addMarker(op.pls_lat, op.pls_lon, "Point Last Seen (PLS)", op.pls_location || "", "#0000FF");
    }

    // 4. Generate & Project the Probability Range Rings around the true active IPP center
    const categoryData = getCategoryById(op.subject_category) || getDefaultCategory();
    
    for (const entry of categoryData.distances) {
      // Create ring polygons using the resolved target coordinates
      const ringGeoJSON = makeCircleGeoJSON(
        targetLat, 
        targetLon, 
        entry.km, 
        `${ringLabel} - ${entry.pct}% (${categoryData.label})`, 
        "#FF9900", 
        0.05
      );
      await client.addShape(ringGeoJSON);
    }

    res.json({ success: true, mapUrl: client.getMapUrl() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
8.4 Enhanced Weather Router — src/routes/weather.ts
This updated proxy implementation explicitly grabs coordinates from the operational anchor point, queries the environment metrics provider, parses skies, wind, and severe hazard alerts, and tracks specific metrics exactly 24 hours and 72 hours out.

TypeScript
import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import axios from 'axios';

const db = new Database('sarmanager.db');
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { operation_id } = req.query;
  if (!operation_id) return res.status(400).json({ error: 'Missing operation_id parameter.' });

  try {
    const op = db.prepare('SELECT latitude, longitude, ipp_type, pls_lat, pls_lon FROM operations WHERE id = ?').get(operation_id);
    if (!op) return res.status(404).json({ error: 'Operation context not found.' });

    // Determine coordinate base based on selected IPP type
    const lat = op.ipp_type === 'pls' ? op.pls_lat : op.latitude;
    const lon = op.ipp_type === 'pls' ? op.pls_lon : op.longitude;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Resolved IPP coordinate pointers are empty.' });
    }

    // Example leveraging a standard programmatic Weather API integration framework (e.g., weatherapi or openweathermap)
    const apiKey = 'YOUR_WEATHER_API_KEY_FROM_CONFIG'; 
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lon}&days=4&alerts=yes`;
    
    const response = await axios.get(url);
    const data = response.data;

    // Epoch tracking points to calculate exact offsets
    const nowEpoch = Math.floor(Date.now() / 1000);
    const target24hEpoch = nowEpoch + (24 * 60 * 60);
    const target72hEpoch = nowEpoch + (72 * 60 * 60);

    // Flat array mapping of all hourly blocks returned across the 4-day structural forecast request
    const allForecastHours = data.forecast.forecastday.flatMap((day: any) => day.hour);

    // Locator utility picking the closest forecast timestamp matching targets
    const findClosestHour = (targetEpoch: number) => {
      return allForecastHours.reduce((prev: any, curr: any) => 
        Math.abs(curr.time_epoch - targetEpoch) < Math.abs(prev.time_epoch - targetEpoch) ? curr : prev
      );
    };

    const hour24 = findClosestHour(target24hEpoch);
    const hour72 = findClosestHour(target72hEpoch);

    // Cleaned payload map formatted strictly for Ground Searcher mobile client rendering
    const operationalWeatherPayload = {
      current: {
        temp_c: data.current.temp_c,
        skies: data.current.condition.text,       // e.g., "Clear", "Heavy Raining", "Cloudy"
        wind_kph: data.current.wind_kph,
        wind_dir: data.current.wind_dir,         // e.g., "NW", "ESE"
        humidity: data.current.humidity
      },
      alerts: data.alerts?.alert?.map((alert: any) => ({
        event: alert.event,                     // e.g., "Severe Flash Flood Warning"
        headline: alert.headline,
        severity: alert.severity,
        desc: alert.desc
      })) || [],
      forecast_24h: {
        time: hour24.time,
        temp_c: hour24.temp_c,
        skies: hour24.condition.text,
        wind_kph: hour24.wind_kph,
        wind_dir: hour24.wind_dir
      },
      forecast_72h: {
        time: hour72.time,
        temp_c: hour72.temp_c,
        skies: hour72.condition.text,
        wind_kph: hour72.wind_kph,
        wind_dir: hour72.wind_dir
      }
    };

    res.json(operationalWeatherPayload);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
8.5 Ground Searcher Bottom Panel Data Injection Model
When the Ground Searcher's interface requests its tracking state dataset from the backend engine, the response combines operation-level fields with calculated UTM localization fields:

TypeScript
// Segment inside src/routes/searcher_view.ts or operations fetcher pipelines
router.get('/my-status', (req: Request, res: Response) => {
  const opId = req.query.operation_id;
  
  try {
    const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(opId);
    
    // Convert base variables to dynamic string tags for localized display
    const lkp_utm = convertToUTM(op.latitude, op.longitude);
    const pls_utm = convertToUTM(op.pls_lat, op.pls_lon);
    
    // Resolve which UTM string represents the active incident origin (IPP)
    const active_ipp_utm = op.ipp_type === 'pls' ? pls_utm : lkp_utm;

    res.json({
      operation: {
        ...op,
        lkp_utm_string: lkp_utm,
        pls_utm_string: pls_utm,
        active_ipp_utm_string: active_ipp_utm
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
