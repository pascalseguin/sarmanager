# SAR Manager — Bug Tracker

Add one entry per bug. Keep entries here until fixed, then move to the Resolved section at the bottom.

---

## Open Bugs

*(none)*

---

## Resolved

### Bug 4 — No bulk CSV import for equipment
Added CSV import to the Equipment tab. The Equipment List header now has three buttons: 📷 Scan, ↑ JSON, ↑ CSV. CSV must have a `tag` column; optional columns: `name`, `brand`, `serial`, `type`, `location`. A preview table shows parsed items before confirming the import. Items whose tag already exists in the current operation are skipped.

### Bug 7 — Pre-ordered / pre-numbered QR codes for equipment
Each equipment item in the Equipment tab now has two new buttons:
- **QR** — shows and downloads the `sareq1|TAG|NAME|TYPE` QR code for the item. Print and stick directly on the physical equipment.
- **Assign Tag** — assigns a pre-ordered numbered sticker code (e.g. `E001`) to the item. The code is stored in `sar-qr-registry` (same localStorage key used by the Users tab for member tags). Once assigned, the button turns blue and shows the code. The tag modal shows the `sar-tag|E001` QR to print and a Download PNG button.
- Scanning a `sar-tag|EXXX` code in the Equipment QR scanner now resolves the registry entry and auto-adds the equipment item to the operation.
- `parseEquipQR()` updated to handle both `sareq1|...` and `sar-tag|CODE` formats.

### Bug 8 — Users tab 404 on GET/POST /api/users
Route (`src/routes/users.ts`) was registered correctly in `src/server.ts` line 73. The running Electron app was an old compiled build that predated the route. Fixed by running `publish.ps1` to rebuild.

### Bug 9 — CalTopo publish 401 "User not logged in" on markers and rings
Fixed `src/routes/caltopo.ts` and `src/lib/caltopo.ts`. Two root causes:
1. `expires` was computed in milliseconds (`Date.now() + 120000`) but CalTopo expects seconds — changed to `Math.floor(Date.now() / 1000) + 120` to match sartopo-python behaviour.
2. Credentials are now `.trim()`'d when read from the config table — accidental whitespace when pasting causes silent auth failure.
3. Auto-recovery: if an existing stored `caltopo_map_id` returns 401/403 (e.g. a map created in a personal CalTopo account rather than via the team API), the route now provisions a fresh team-account map and retries automatically.

### Bug 1 — CalTopo publish 400 Bad Request
Fixed IPP coordinate fallback in `src/routes/caltopo.ts`. The fallback path was setting `op.ippLat` but then reading from the local variable `ippLat` (still null) and `op.latitude` (also null), so coordinates were lost. Simplified to: `lat = (preferred) ?? op.latitude ?? op.pls_lat`.

### Bug 2 — Overpass hospital query 406 (curly quotes + missing encodeURIComponent)
Fixed `fetchNearestHospital()` in `IncidentBase.tsx`. The hospital query URL contained curly Unicode quotes in the Overpass QL string and was not wrapped in `encodeURIComponent`. Rewrote using string concatenation with explicit ASCII quotes and `encodeURIComponent(q)`.

### Bug 3 — Checked-in member shows `â–²` instead of ▲
Fixed `memberStatus()` in `IncidentBase.tsx` line ~695. The green status label was the UTF-8 bytes for ▲ stored as Latin-1, causing mojibake. Replaced with the correct ▲ Unicode character.

### Bug 5 — Equipment dashboard sidebar shows edit/add controls
Added `readOnly?: boolean` prop to `EquipmentWidget`. When `readOnly=true`: hides Check/Undo/× action buttons, replaces assign dropdown with static text, hides the add form, hides scan/import header buttons. Both sidebar instances (board tab and non-board panel) now pass `readOnly`.

### Bug 6 — Weather 502 Bad Gateway (Open-Meteo direct call)
Fixed `fetchWeather()` in `IncidentBase.tsx`. Was calling Open-Meteo directly from the browser. Now proxies through the Express backend (`/api/weather`) which uses Environment Canada data (GeoMet) — more appropriate for Alberta ops and avoids CORS/gateway issues. Response mapped from EC format to `{ now, next }`.
