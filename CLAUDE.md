# Trip Planner AI — Claude Code Reference

> **⚠️ Deployment note:** This project runs on **Railway (production only)**. The user does NOT run the server or dashboard locally. When verifying changes, assume they are tested via the deployed Railway URLs, not `localhost`. Do not suggest `npm run dev` as the verification step — suggest pushing to GitHub (Railway auto-deploys from `main`). API keys and env vars are configured in the Railway dashboard, not a local `.env` file.

## Project Overview

A **generic Group Holiday Planner** PWA. An organiser creates a trip and shares a group code (e.g. `FARO-XK3M`) or QR code. Members join by entering the code and selecting their name. No authentication in Phase 1/2 — roles stored in localStorage.

**GitHub:** https://github.com/Sharusan17/trip-planner-ai

### Phase Status
- **Phase 1** ✅ Complete — Trip creation/joining, itinerary, map, weather, currency
- **Phase 2** ✅ Complete — Expenses, settlements, transport, accommodation, deposits
- **Phase 3** ✅ Complete — Announcements, polls, photo album, receipt OCR
- **Phase 4** ⏳ Planned — AI assistant (Claude API), push notifications, local events, deals finder

---

## Monorepo Structure

```
trip-planner-ai/
├── shared/     @trip-planner-ai/shared — TypeScript types (built before server/dashboard)
├── server/     Express + TypeScript + PostgreSQL (port 3001)
└── dashboard/  React 19 + Vite 8 + Tailwind CSS v4 (port 5173)
```

Root workspace config at `package.json` uses npm workspaces.

---

## Running the Project

> The user runs everything on Railway, but these commands exist for reference.

### Dev (server + dashboard concurrently)
```bash
npm run dev
```

### Server only
```bash
npm run dev:server
```

### Dashboard only
```bash
npm run dev:client
```

### Run DB migrations
```bash
npm run migrate -w server
```
(Migrations are inline in `server/src/db/migrate.ts` — no separate `.sql` files.)

### Seed demo data
```bash
npm run seed -w server
```

### Build
```bash
npm run build
```

---

## Environment Setup

### Railway (production — this is how the user runs it)
Two separate services — `server` and `dashboard`:

**server service env vars:**
- `DATABASE_URL` — auto-injected by Railway when Postgres is linked
- `NODE_ENV=production`
- `DASHBOARD_URL=https://your-dashboard.up.railway.app` — for CORS
- `LITEAPI_API_KEY` — optional, enables hotel search autocomplete
- `TABSCANNER_API_KEY` — optional, enables receipt OCR scanning
- `FLIGHTAPI_KEY` — optional, enables flight number lookup + live status (FlightAPI.io, supports date param + budget carriers)

**dashboard service env vars:**
- `VITE_API_URL=https://your-server.up.railway.app` — points dashboard at the server API

### Supabase (Phase 4)
`@supabase/supabase-js` is installed in dashboard but not yet wired. Auth integration is planned for Phase 4.

---

## Key Conventions

### Session Storage
- localStorage key: `trip-planner-ai-session`
- Stores: `{ tripId: string, travellerId: string }`
- `isOrganiser` derived from `activeTraveller.role === 'organiser'`

### Group Code Format
- Auto-generated on trip creation: `XXXX-XXXX` (e.g. `FARO-XK3M`)
- Stored in `trips.group_code` (UNIQUE)
- Join flow: enter code → `GET /api/v1/trips?code=XXXX-XXXX` → pick traveller

### API Base URL
- Dev: proxied via Vite (`/api` → `localhost:3001`) — no `VITE_API_URL` needed
- Production: set `VITE_API_URL` on the dashboard service to the server's Railway URL
- Client: `dashboard/src/api/client.ts` reads `VITE_API_URL` at build time

### Traveller Cost Weights
- Adult: `1.0`, Child: `0.5`, Infant: `0.0` (defaults)
- Used in weighted expense splitting

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19.2, Vite 8, TypeScript, React Router v7 |
| State | @tanstack/react-query v5 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin) |
| Icons | lucide-react (no emoji in nav/UI chrome) |
| Maps | Leaflet 1.9 + react-leaflet 5 |
| Drag & Drop | @dnd-kit (core + sortable + utilities) |
| QR Codes | qrcode.react |
| Backend | Express 4, TypeScript, Node.js |
| Database | PostgreSQL (pg pool); migrations inline in `migrate.ts` |
| File storage | BYTEA columns in Postgres (no disk / object storage) |
| Auth (future) | Supabase — installed, not wired |
| Weather API | Open-Meteo forecast + marine (free, no key) |
| Currency API | open.er-api.com (free, no key; 1-hour DB cache) |
| Location Search | Nominatim / OpenStreetMap (free, no key) |
| Hotel Search | LiteAPI (requires `LITEAPI_API_KEY`, server proxy) |
| Receipt OCR | Tabscanner (requires `TABSCANNER_API_KEY`, server proxy) |
| Airport Search | Static bundle at `server/src/data/airports.json` (no API) |

---

## Server Routes

All mounted at `/api/v1` (except `trips` at `/api/v1/trips`, weather/currency at their own prefixes). See `server/src/app.ts`.

| Router | Endpoints |
|---|---|
| `trips.ts` | Trip CRUD, code lookup |
| `travellers.ts` | Traveller CRUD, PIN verify |
| `itinerary.ts` | Days CRUD + activities CRUD + activity reorder |
| `locations.ts` | Map locations CRUD |
| `weather.ts` | Forecast + marine data (Open-Meteo proxy) |
| `currency.ts` | Rates + conversion (er-api proxy, DB-cached) |
| `expenses.ts` | Expense CRUD, splits, budgets, receipt upload/retrieve |
| `settlements.ts` | Generate + pay + delete settlements |
| `transport.ts` | Transport bookings + vehicles + seat assignments |
| `accommodation.ts` | Accommodation bookings CRUD |
| `deposits.ts` | Deposit CRUD + summary |
| `announcements.ts` | Announcements CRUD + pin |
| `polls.ts` | Polls CRUD + vote |
| `photos.ts` | Photo upload/retrieve/delete (BYTEA in DB) |
| `receipts.ts` | `POST /receipts/scan` — Tabscanner OCR |
| `hotelSearch.ts` | `GET /hotels/search` — LiteAPI hotel autocomplete |
| `flightSearch.ts` | `GET /airports/search` — static bundled airports; `GET /flights/lookup` — Aviationstack flight number lookup; `GET /flights/status` — live flight status (within 24h) |

### Server Services
| File | Purpose |
|---|---|
| `currencyService.ts` | Fetch FX rates with 1-hour DB cache |
| `weatherService.ts` | Fetch Open-Meteo forecast + marine data |
| `airportCache.ts` | Load static airports.json into memory, filter by IATA/name/city |
| `flightService.ts` | FlightAPI.io flight lookup + live status by date; reads/writes `flight_lookup_cache` (24h TTL), 5-min in-memory status cache |

---

## Dashboard Pages

All under `dashboard/src/pages/`. The app has **5 hub pages** with form pages for each resource.

### Hub pages
- `DashboardPage` — Trip overview, stats, upcoming activities
- `TravellersPage` — Manage group members
- `MapPage` — Interactive map with locations, activities, search
- `ExpensesPage` — **Finance hub**: expenses + settlements + deposits + budgets
- `LogisticsPage` — **Logistics hub**: transport + vehicles + accommodation
- `CommunityPage` — **Community hub**: announcements + polls + photo album

### Flow pages
- `LandingPage` — Create/join trip
- `TripSetupPage` — Guided setup wizard (holiday type → travellers → accommodation → transport → activities) with progress strip

### Form pages (create/edit)
- `TravellerFormPage`, `DayFormPage`, `ActivityFormPage`
- `ExpenseFormPage` (with receipt upload + OCR auto-fill)
- `DepositFormPage`
- `TransportBookingFormPage` (with airport autocomplete on flight type)
- `AccommodationFormPage` (with LiteAPI hotel autocomplete)
- `AnnouncementFormPage`, `PollFormPage`
- `PhotoUploadPage`, `PhotoAlbumPage`

### Legacy redirects (kept for old bookmarks)
`/transport`, `/accommodation` → `/logistics`
`/settlements`, `/deposits`, `/currency` → `/expenses`
`/announcements`, `/polls` → `/community`

---

## Dashboard Components

Under `dashboard/src/components/`:

| Folder | Contents |
|---|---|
| `dashboard/` | Trip overview cards — summary stats, expense charts, upcoming activities |
| `layout/` | `AppShell`, `Sidebar`, `TripHeader` |
| `setup/` | Setup wizard pieces: `PlaceAutocomplete`, `SetupProgressStrip`, `SetupCard`, `SetupTip`, `SetupStepHolidayType`, `SetupStepTravellers`, `SetupStepAccommodation`, `SetupStepTransport`, `SetupStepActivities` |
| `WeatherWidget.tsx` | Forecast display (top-level) |

### Sidebar nav items
Dashboard · Travellers · Itinerary · Map · Finance · Logistics · Community · Leave Trip (footer)

---

## Database Schema

All migrations inline in `server/src/db/migrate.ts`. Current tables (22):

- **Core:** `trips`, `travellers`, `itinerary_days`, `activities`, `locations`
- **Caches:** `currency_cache`, `flight_lookup_cache`
- **Finance:** `expenses`, `expense_splits`, `expense_budgets`, `settlements`, `deposits`
- **Logistics:** `transport_bookings`, `transport_travellers`, `vehicles`, `vehicle_seat_assignments`, `accommodation_bookings`, `accommodation_travellers`
- **Community:** `announcements`, `polls`, `poll_options`, `poll_votes`, `trip_photos`

### File storage
Photos and receipts are stored as `BYTEA` columns in Postgres — no disk, no object storage. Columns: `trip_photos.data` / `mime_type`, `expenses.receipt_data` / `receipt_mime`. `expenses.line_items` is JSONB (populated from Tabscanner OCR).

---

## Shared Types

Under `shared/src/types/`. One file per domain: `trip`, `traveller`, `itinerary`, `map`, `weather`, `currency`, `expense`, `settlement`, `transport`, `accommodation`, `deposit`, `announcement`, `poll`, `photo`. All re-exported from `shared/src/index.ts`.

---

## Design System Classes

Defined in `dashboard/src/styles/globals.css`. Always use these — do not add inline Tailwind for card/button patterns.
Icons: use `lucide-react` SVG icons. No emoji in navigation or UI chrome.

| Class | Use |
|-------|-----|
| `.vintage-card` | White card with 12px radius + subtle shadow |
| `.btn-primary` | Blue filled button (`#2563EB`) |
| `.btn-secondary` | White/ghost outlined button |
| `.btn-danger` | Red button (`#EF4444`) |
| `.vintage-input` | Form inputs — white bg, 8px radius, blue focus ring (⚠️ has `width: 100%` — override with `style={{ width: 'auto' }}` on flex selects) |
| `.badge` | Base badge (6px radius) |
| `.badge-navy` | Blue tint badge |
| `.badge-gold` | Orange tint badge |
| `.badge-terracotta` | Red tint badge |
| `.badge-green` | Green tint badge |
| `.status-badge-pending` | Amber pill — pending state |
| `.status-badge-paid` | Emerald pill — paid state |
| `.status-badge-overdue` | Red pill — overdue state |
| `.progress-bar-track` | Progress track (full-radius) |
| `.progress-bar-fill` | Blue gradient fill |

### Colour Tokens
```
--color-parchment:      #F8FAFC  (page bg)
--color-parchment-dark: #E2E8F0  (borders/dividers)
--color-parchment-light:#FFFFFF  (card/surface bg)
--color-navy:           #2563EB  (primary blue)
--color-navy-light:     #3B82F6  (blue light)
--color-navy-dark:      #1D4ED8  (blue dark / hover)
--color-gold:           #F97316  (orange accent)
--color-gold-light:     #FB923C  (orange light)
--color-gold-aged:      #EA580C  (orange dark)
--color-terracotta:     #EF4444  (red / danger)
--color-ink:            #0F172A  (text primary)
--color-ink-light:      #475569  (text secondary)
--color-ink-faint:      #94A3B8  (text tertiary)
--color-sidebar:        #0F172A  (sidebar bg)
```

### Typography
```
--font-display: 'Outfit', sans-serif   (headings, labels)
--font-body:    'Work Sans', sans-serif (body, buttons, inputs)
--font-mono:    'Courier New', monospace (group codes)
```

---

## File Patterns

### Adding a new server route
1. Create `server/src/routes/[resource].ts`
2. Import and register in `server/src/app.ts` with `app.use('/api/v1', router)`

### Adding a new shared type
1. Create `shared/src/types/[domain].ts`
2. Export from `shared/src/index.ts`

### Adding a new page
1. Create `dashboard/src/pages/[Name]Page.tsx`
2. Add `<Route path="/path" element={<NamePage />} />` inside `<AppShell>` in `dashboard/src/App.tsx`
3. Add to `navItems` array in `dashboard/src/components/layout/Sidebar.tsx` (only if it's a top-level hub)

### Adding a new client API module
1. Create `dashboard/src/api/[resource].ts`
2. Import from `client.ts` base: `import { api } from './client'`

### Adding a new DB table / column
1. Append a new migration block inside `server/src/db/migrate.ts` (no separate files)
2. Railway runs migrations on deploy via the `start` command

---

## External API Integration Patterns

- **Never call paid/keyed APIs from the browser.** All keyed external services (LiteAPI, Tabscanner) are proxied via the server so the key stays server-side.
- **Free, keyless APIs are OK from the browser** — Nominatim location search and Photon POI search are called directly from the dashboard.
- **Static data beats paid APIs** where possible — airport autocomplete is a bundled JSON file (7 914 airports) with zero runtime dependency.

---

## Git Commits

- No `Co-Authored-By` lines
- Conventional commit style: `feat:`, `fix:`, `chore:`, `docs:`
- Push to: `https://github.com/Sharusan17/trip-planner-ai.git` (branch: `main`)
- Railway auto-deploys `main` on every push
