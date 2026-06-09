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

## Security Requirements (OWASP Top 10:2025)

> SAR Manager handles sensitive PII (subject name, age, sex, location, medical), operational credentials (CalTopo HMAC secret, D4H API token), and real-time field data. Security must be designed in from Phase 1 — not bolted on later.

---

### A01 — Broken Access Control
**Risk to this app:** API routes expose operations, members, and equipment. Without server-side checks, any authenticated user could read or mutate another org's data or access admin endpoints.

**Controls (implement in Phase 1 + 2):**
- Every API route enforces `org_id` from the verified JWT — never from the request body or query string
- Helper `requireOrgAccess(orgId, session)` wraps every DB query; routes never query without it
- `sm` / `ops` role required for write operations; `searcher` role is read-only on their own operation
- `DELETE` and `PATCH /settings` require `sm` role, enforced server-side
- No client-supplied `org_id` is trusted — extract it from the Azure AD token claim only
- Audit log entry on every destructive action (close operation, delete member, change credentials)

---

### A02 — Security Misconfiguration
**Risk to this app:** Next.js defaults expose stack traces; Azure App Service may have unnecessary ports open; error responses may leak internal paths or DB schema.

**Controls (implement at deployment time):**
- `NODE_ENV=production` enforced in Azure App Service — disables Next.js detailed error pages
- Centralised error handler in all API routes: return `{ error: 'Internal server error' }` with no stack trace
- Remove all `console.log` debug output before deploy (replace with structured logger writing to Azure Monitor)
- Security headers via `next.config.ts`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Content-Security-Policy`
- Azure App Service: disable FTP, enable HTTPS-only, disable remote debugging
- `.env.local` never committed; secrets in Azure Key Vault referenced via App Service environment bindings

---

### A03 — Software Supply Chain Failures
**Risk to this app:** `npm install` pulls hundreds of transitive dependencies; a compromised package (like the 2025 npm worm) could exfiltrate CalTopo credentials or D4H tokens.

**Controls (implement continuously):**
- `npm audit` run in CI on every PR; block merge on high/critical findings
- Pin dependency versions in `package-lock.json`; use `npm ci` (not `npm install`) in CI
- Generate and maintain an SBOM (`npm sbom --format=spdx-json` or `cyclonedx-npm`)
- GitHub Dependabot alerts enabled on the repo
- Prefer well-maintained, widely-used packages; avoid single-maintainer packages for auth/crypto paths
- Review any `postinstall` scripts before accepting a dependency

---

### A04 — Cryptographic Failures
**Risk to this app:** CalTopo HMAC secret and D4H API token stored in `settings` table in plaintext; subject PII transmitted over network; session tokens.

**Controls (implement in Phase 1 + 2):**
- All credentials in `settings` table encrypted at rest using Azure PostgreSQL Transparent Data Encryption (on by default) — verify it is enabled
- CalTopo secret and D4H token stored in Azure Key Vault; referenced at runtime, never materialised in DB
- TLS 1.2+ enforced at Azure App Service level (disable TLS 1.0/1.1)
- Passwords (if email/password fallback added in Phase 6) hashed with **Argon2id** via the `argon2` npm package — never MD5, SHA1, or unsalted SHA256
- JWT tokens from Azure AD validated against JWKS endpoint on every request; never trusted without verification
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Strict`

---

### A05 — Injection (SQL, XSS, Command)
**Risk to this app:** PostgreSQL queries built from user-supplied subject name, location, notes; CalTopo/D4H API calls with user-supplied values; React rendering user-supplied text (subject description, clothing, notes).

**Controls (implement in Phase 1 + 3):**
- **SQL:** Use parameterised queries exclusively via `pg` — never string-concatenate SQL. Example: `db.query('SELECT * FROM operations WHERE org_id = $1 AND id = $2', [orgId, opId])`
- **XSS:** React escapes JSX by default — never use `dangerouslySetInnerHTML`. Sanitise before using it if rich text is ever added
- **Command injection:** No `exec()` / `spawn()` calls with user input. CalTopo and D4H calls go through typed fetch wrappers only
- **Header injection:** Validate and strip newlines from any user-supplied value that flows into HTTP headers (e.g. CalTopo API title field)
- Add `eslint-plugin-security` to the ESLint config to catch injection patterns at lint time

---

### A06 — Insecure Design
**Risk to this app:** Multi-tenant architecture (Phase 6) requires `org_id` isolation baked into every query from day one — retrofitting it later is error-prone.

**Controls (design-time decisions, implement in Phase 1):**
- `org_id` column added to every table from the initial schema (already in plan) — enforced in queries before Phase 6
- Threat-model the callout flow: D4H callout sends SMS to team members — rate-limit the endpoint to prevent abuse (e.g., 5 callouts per operation per hour)
- Settings page (CalTopo secret, D4H token) accessible to `sm` role only; misuse-case: a `searcher` role user should never see credentials
- Intake wizard: validate that PLS/LKP coordinates are plausible (lat ∈ [-90,90], lon ∈ [-180,180]) server-side before storing or forwarding to CalTopo
- Real-time socket (Phase 4): authenticate socket connections with the same JWT used for HTTP — unauthenticated socket connections rejected at handshake

---

### A07 — Authentication Failures
**Risk to this app:** Azure AD is the primary identity provider, but misconfiguration (wrong tenant, missing audience check) could allow tokens from other orgs to authenticate.

**Controls (implement in Phase 2):**
- Validate Azure AD JWT on every API request: `iss`, `aud`, `tid`, and `exp` claims all checked — use `jwks-rsa` + `jsonwebtoken`
- `tid` (tenant ID) must match the org's registered tenant from the `organizations` table — prevents cross-tenant token reuse
- No custom session management — rely on Azure AD token lifetimes (access token: 1 hour max)
- If email/password fallback is added: enforce NIST 800-63b password rules, check against HaveIBeenPwned API on registration, require MFA
- Socket.io (Phase 4): require JWT in handshake auth; reject and disconnect on token expiry without re-auth

---

### A08 — Software and Data Integrity Failures
**Risk to this app:** CI/CD pipeline deploys to Azure App Service; a compromised pipeline step could push malicious code to production. CalTopo template GeoJSON uploaded by admins could contain unexpected payloads.

**Controls (implement at CI/CD setup):**
- GitHub Actions workflow requires PR approval before deploy; no direct push to `main` branch
- Pin GitHub Actions to commit SHA (e.g., `actions/checkout@abc123`), not a mutable tag like `@v3`
- CalTopo map template GeoJSON validated server-side before storing: must parse as valid JSON, only `Feature` objects accepted, size-limited to 500KB
- D4H and CalTopo API responses validated against expected shape before being used — never blindly deserialised and re-executed

---

### A09 — Security Logging and Alerting Failures
**Risk to this app:** A compromised `sm` account exfiltrating subject PII or CalTopo credentials could go undetected without adequate audit logging.

**Controls (implement in Phase 1 + deployment):**
- Structured audit log for all security-relevant events: login, logout, failed auth, operation create/close, settings change, callout sent, credential access
- Log fields: `timestamp`, `user_id`, `org_id`, `action`, `resource_id`, `ip`, `result`
- Logs written to Azure Monitor / Application Insights — not stored only in the DB where a compromised account could erase them
- Alert on: ≥5 failed logins in 5 minutes per IP; settings (credentials) read outside business hours; new user added to `sm` role
- Do **not** log: CalTopo secret, D4H token, subject medical details, full coordinates (log operation ID only in access logs)
- Retention: 90 days minimum for audit logs (PIPEDA / PIPA consideration for Canadian SAR orgs)

---

### A10 — Mishandling of Exceptional Conditions
**Risk to this app:** A failed CalTopo API call mid-publish, a dropped Socket.io connection during check-in, or an unhandled PostgreSQL error could corrupt operation state or expose raw error details to the client.

**Controls (implement in Phase 1 + 3):**
- All API routes wrapped in try/catch; unhandled promise rejections caught by a global handler in `instrumentation.ts`
- CalTopo publish and D4H callout are non-transactional external calls — failures return a structured error to the frontend, never crash the server
- PostgreSQL transactions used for any multi-step write (e.g., create operation + create initial member in one transaction); rollback on any step failure
- Socket.io disconnect handling: client reconnects with exponential backoff; server does not hold partial state on client drop
- Resource limits: file upload endpoints (GeoJSON template, D4H CSV) reject payloads over 2MB with `413 Payload Too Large` before parsing
- Sanitise all error messages returned to the client: `{ error: 'Publish failed — check CalTopo credentials' }` not `{ error: 'ECONNREFUSED 127.0.0.1:5432' }`

---

### Additional Critical Controls (not directly mapped to OWASP Top 10)

| Control | Why it matters here | When |
|---|---|---|
| **Rate limiting** | Callout endpoint triggers real SMS; D4H API has rate limits. Use `express-rate-limit` equivalent (Next.js middleware) | Phase 2 |
| **CORS** | Next.js API routes should only accept requests from the app's own origin in production | Phase 1 |
| **CSRF protection** | Next.js App Router uses same-origin fetch by default; add `SameSite=Strict` to cookies and verify `Origin` header on state-changing routes | Phase 2 |
| **Input size limits** | All POST bodies limited to 100KB (except GeoJSON/CSV upload routes, capped at 2MB) | Phase 1 |
| **Secrets rotation** | CalTopo secret and D4H token must be rotatable without downtime — store in Key Vault, reference by name, not value | Phase 1 |
| **Dependency lock** | `package-lock.json` committed and `npm ci` used in CI — prevents dependency confusion attacks | Phase 1 |
| **PII minimisation** | Only collect subject data required for the operation; do not log PII to application logs | Phase 1 |
| **Azure AD Conditional Access** | Require MFA for `sm` role logins via Azure AD Conditional Access policy | Phase 2 |
| **Penetration test** | Commission a pentest before Phase 6 (multi-tenancy launch) — org isolation logic is the highest-risk surface | Phase 6 |

---

### Infrastructure & Azure Hardening

**PostgreSQL network isolation:**
- PostgreSQL Flexible Server deployed with **no public internet endpoint** — private endpoint only, accessible from App Service via Azure VNet integration
- Network Security Group (NSG) on the DB subnet: inbound allow only from App Service subnet; deny all else
- App Service Outbound IPs allowlisted in PostgreSQL firewall as a secondary control (defence in depth)
- Enable **Azure Defender for PostgreSQL** — detects anomalous queries, unusual access patterns, and brute-force attempts

**App Service hardening:**
- Use **Managed Identity** (system-assigned) for App Service → Key Vault access — no service account password, no secret in env vars
- All secrets (CalTopo HMAC secret, D4H API token, `NEXTAUTH_SECRET`, `DATABASE_URL`) stored in **Azure Key Vault**; App Service references them as Key Vault references in application settings
- Disable SCM/Kudu site if not needed (`scmSiteAlsoStopped=true`)
- Enable **Azure App Service Authentication** as an additional layer in front of the Next.js auth (optional but adds depth)
- Set minimum TLS version to 1.2 in App Service TLS/SSL settings
- Enable **Always On** to prevent cold-start attacks that can bypass warm-up security checks

**Azure Monitor & Security Centre:**
- Enable **Microsoft Defender for Cloud** on the subscription — covers App Service, PostgreSQL, and Key Vault
- Configure **Diagnostic Settings** on Key Vault to log all secret reads to a Log Analytics workspace
- Set up alerts on Key Vault for secret access outside business hours or by unexpected identities
- Enable **Azure DDoS Protection Standard** if budget permits; at minimum use App Service's built-in DDoS basic tier

---

### HTTP Security Headers

Add to `next.config.ts` under `headers()`:

```ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // remove unsafe-inline once nonces are implemented
      "style-src 'self' 'unsafe-inline' https://unpkg.com",  // Leaflet CSS
      "img-src 'self' data: https://*.tile.opentopomap.org https://*.openstreetmap.org",
      "connect-src 'self' https://caltopo.com https://nominatim.openstreetmap.org https://api.team-manager.ca.d4h.com wss:",
      "font-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  },
];
```

- Validate headers with [securityheaders.com](https://securityheaders.com) after deployment
- Tighten CSP `script-src` from `unsafe-inline` to nonce-based once Next.js nonce support is fully wired up

---

### Data Protection & Canadian Privacy Law

This app processes PII (name, age, sex, clothing, location) of missing persons under active SAR operations, which falls under **PIPEDA** (federal) and **PIPA Alberta** (provincial).

**Data residency:**
- All Azure resources deployed to **Canada Central** (Toronto) or **Canada East** (Quebec City) — data must not leave Canada
- Verify that Azure Monitor / Log Analytics workspace is also in a Canadian region
- Disable any Azure features that replicate data to US regions (geo-redundant storage for logs should use Canada pairs only)

**Data minimisation & retention:**
- Closed operations older than 2 years: automatically anonymise subject PII (name → `[redacted]`, age/sex/clothing → null) via a scheduled job — retain operational metadata (team structure, equipment, times) for after-action review
- Implement a `DELETE /api/operations/:id/pii` endpoint (SM role only) for explicit erasure requests
- Do not store subject coordinates in application logs — log operation ID only
- D4H CSV imports: discard the raw CSV after parsing; never persist it to DB or disk

**Breach notification:**
- PIPEDA requires notification to the Privacy Commissioner and affected individuals of breaches posing "real risk of significant harm" — within a reasonable time (recommended: 72 hours)
- Document a breach response runbook: who is notified (SEASAR leadership, Privacy Commissioner, affected individuals), who is responsible, what evidence is preserved
- Azure Security Centre will alert on credential exposure and anomalous data access — wire these alerts to a SEASAR operations email

**Privacy by design:**
- Settings page (CalTopo secret, D4H token, org details) — accessible to `sm` role only; no searcher should ever see credentials in the UI
- Searcher portal (`/operations/[id]/searcher`) shows only the searcher's own assignment, team, and gear — never the full member list or subject PII

---

### DevSecOps Pipeline

**Static analysis (SAST):**
- Add **CodeQL** GitHub Action — scans TypeScript for injection, path traversal, and prototype pollution on every PR
- Add **Semgrep** with the `p/typescript` and `p/nextjs` rulesets as a second SAST pass
- Add `eslint-plugin-security` and `eslint-plugin-no-secrets` to ESLint — catches hardcoded secrets and insecure patterns at lint time

**Secret scanning:**
- Enable **GitHub Secret Scanning** and **Push Protection** on the repo — blocks commits containing API keys, connection strings, or private keys
- Add a **pre-commit hook** (via `husky` + `detect-secrets`) that refuses commits if a high-entropy string pattern is detected
- Audit git history with `git-secrets` or `trufflehog` before the repo goes public

**Dependency scanning:**
- **Dependabot** enabled with weekly updates for all dependency manifests (`package.json`, GitHub Actions)
- `npm audit --audit-level=high` run as a required CI step; PRs with high/critical findings blocked from merging

**Container / IaC scanning (if applicable):**
- If Docker is introduced: scan images with **Trivy** in CI before push to Azure Container Registry
- Scan Azure Bicep / ARM templates with **Checkov** before infrastructure deployments

**CI/CD supply chain:**
- All GitHub Actions pinned to commit SHA, not mutable version tags
- Restrict Actions secrets (deployment credentials, Key Vault access) to the `main` branch only
- Require two reviewers for PRs that touch auth, settings, or DB migration files

---

### API Hardening

- **Pagination on all list endpoints** — `GET /operations` returns max 100 rows; `GET /members` max 200 — prevents credential-stuffed accounts from bulk-exporting PII
- **Field projection** — API responses return only the fields the client role is authorised to see (searchers never receive `caltopo_secret`, `d4h_api_token`, or other members' phone numbers)
- **Idempotency keys** on write operations — prevents duplicate callouts or member check-ins from double-tap or network retry
- **API versioning** — prefix all routes `/api/v1/...` from Phase 1; allows clean deprecation without breaking clients
- **OpenAPI schema** — generate a schema from route handlers; use it for server-side request validation via `zod` and for future client generation
- **CORS** — restrict to the app's own origin in production; no wildcard `*` allowed; Socket.io `origin` option set explicitly
- **Request tracing** — generate a `X-Request-ID` on every inbound request and propagate it through all log entries and outbound API calls (CalTopo, D4H) for incident correlation

---

### Real-Time Security (Socket.io — Phase 4)

- **JWT authentication on handshake** — client sends access token in `auth` object; server validates before allowing room join:
  ```ts
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const payload = verifyAzureToken(token); // throws on invalid
    socket.data.userId = payload.sub;
    socket.data.orgId  = payload.org_id;
    next();
  });
  ```
- **Room isolation** — clients only join `operation:{id}` rooms where they have DB-verified access; server checks membership before `join()`
- **Event payload validation** — all inbound socket events validated with `zod` before any DB write; malformed events are rejected and logged
- **Rate limiting on socket events** — max 60 events/minute per connection using `socket.io-rate-limiter` or a rolling counter; disconnect on sustained violation
- **Token expiry** — client listens for Azure AD token expiry, refreshes silently, sends new token via `socket.emit('auth:refresh', newToken)` which server re-validates; stale tokens trigger forced disconnect
- **No sensitive data in broadcast events** — `member:update` events contain IDs and status only; clients re-fetch full member data via REST if needed

---

### External Integration Security (CalTopo & D4H)

**CalTopo:**
- HMAC secret stored in Azure Key Vault; read once at request time via Key Vault reference — never cached in memory longer than the request lifecycle
- Validate CalTopo API responses against expected shape before using them (`zod` schema); reject unexpected fields
- Set a strict timeout (10 seconds) on all CalTopo fetch calls; circuit-break after 3 consecutive failures to avoid hanging requests
- CalTopo map IDs treated as opaque strings — never interpolated into SQL or shell commands

**D4H:**
- D4H API token stored in Key Vault; scoped to minimum permissions required (read members + write log entries)
- D4H callout endpoint rate-limited server-side to 5 callouts per operation per hour — prevents accidental or malicious SMS spam to team members
- Validate D4H member import CSV server-side: max 500 rows, UTF-8 or UTF-16 encoding only, no embedded formula characters (`=`, `+`, `-`, `@` at cell start — CSV injection)
- Log every D4H callout to the audit log: who triggered it, operation ID, timestamp, recipient count

**Nominatim (reverse geocoding):**
- Add `User-Agent: SAR-Manager/<version> (contact: <email>)` header as required by Nominatim usage policy
- Cache geocoding results per coordinate pair (rounded to 4 decimal places) in PostgreSQL for 24 hours — reduces external dependency and respects rate limits
- Fail gracefully: if Nominatim is unavailable, fall back to operation name for map title — never crash the publish flow

---

### Operational Security (SAR-Specific)

These risks are unique to the SAR context and not covered by generic frameworks:

- **Active operation confidentiality:** The CalTopo map URL (`caltopo.com/m/{id}`) and subject location coordinates must never appear in application logs, error messages, or API responses to non-authorised roles. A leaked map URL for an active operation could compromise the search.
- **Callout suppression attack:** The D4H callout endpoint, if exploitable, could be used to send false callout SMS to team members — disrupting a live operation. Treat it as a critical-severity endpoint: SM role only, rate-limited, audit-logged, and ideally requiring a second confirmation step in the UI.
- **Insider threat:** SMs have access to all subject PII and operational credentials. Enforce least-privilege within the SM role (a field SM should not need to read the CalTopo HMAC secret). Consider splitting `sm` into `sm` (operational) and `admin` (settings/credentials) roles.
- **Device theft at command post:** If a logged-in device is stolen during an operation, sessions must be revocable. Azure AD Conditional Access can revoke all tokens for a user immediately; ensure the app honours token revocation by validating on every request (not just on login).
- **Debrief data:** After operation close, restrict who can re-open or export the full subject record. Add an `ended_at` immutability check — closed operations cannot be modified without an `admin` override with audit log entry.

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

*Last updated: 2026-05-29. Security section covers OWASP Top 10:2025 + infrastructure hardening, HTTP headers, PIPEDA/PIPA compliance, DevSecOps pipeline, API hardening, Socket.io security, integration security, and SAR-specific operational security. Source of truth for ported features: `sarmanager.worktrees/copilot-worktree-2026-05-14T13-49-47/frontend/src/components/IncidentBase.tsx` (§1–§16, fully indexed and commented).*
