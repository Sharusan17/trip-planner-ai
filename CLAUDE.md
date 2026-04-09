# Trip Planner AI — Claude Code Reference

## Project Overview

A **generic Group Holiday Planner** PWA. An organiser creates a trip and shares a group code (e.g. `FARO-XK3M`) or QR code. Members join by entering the code and selecting their name. No authentication in Phase 1/2 — roles stored in localStorage.

**GitHub:** https://github.com/Sharusan17/trip-planner-ai

### Phase Status
- **Phase 1** ✅ Complete — Trip creation/joining, itinerary, map, weather, currency
- **Phase 2** ✅ Complete — Expenses, settlements, transport, accommodation, deposits
- **Phase 3** 🚧 In progress — Announcements ✅, Polls ✅, push notifications ⏳, photo album ⏳
- **Phase 4** ⏳ Planned — AI assistant (Claude API), local events, deals finder

---

## Monorepo Structure

```
trip-planner-ai/
├── shared/     @trip-planner-ai/shared — TypeScript types (built before server/dashboard)
├── server/     Express + TypeScript + PostgreSQL (port 3001)
└── dashboard/  React 19 + Vite + Tailwind CSS v4 (port 5173)
```

Root workspace config at `package.json` uses npm workspaces.

---

## Running the Project

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

### Local development
Create `server/.env` (see `server/.env.example`):
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/trip_planner_local
PORT=3001
NODE_ENV=development
EXCHANGE_RATE_API_KEY=
```

Run migrations after creating the DB:
```bash
npm run migrate -w server
```

### Railway (production)
Two separate services — `server` and `dashboard`:

**server service env vars:**
- `DATABASE_URL` — auto-injected by Railway when Postgres is linked
- `NODE_ENV=production`
- `DASHBOARD_URL=https://your-dashboard.up.railway.app` — for CORS

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
| Frontend | React 19, Vite 8, TypeScript, React Router v7 |
| State | @tanstack/react-query v5 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin) |
| Icons | lucide-react |
| Maps | Leaflet + react-leaflet |
| Drag & Drop | @dnd-kit |
| QR Codes | qrcode.react |
| Backend | Express 4, TypeScript, Node.js |
| Database | PostgreSQL (pg pool) |
| Auth (future) | Supabase |
| Weather API | Open-Meteo (free, no key) |
| Currency API | open.er-api.com (free, no key) |
| Location Search | Nominatim / OpenStreetMap (free, no key) |

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
| `.vintage-input` | Form inputs — white bg, 8px radius, blue focus ring |
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
3. Add to `navItems` array in `dashboard/src/components/layout/Sidebar.tsx`

### Adding a new client API module
1. Create `dashboard/src/api/[resource].ts`
2. Import from `client.ts` base: `import { api } from './client'`

---

## Git Commits

- No `Co-Authored-By` lines
- Conventional commit style: `feat:`, `fix:`, `chore:`
- Push to: `https://github.com/Sharusan17/trip-planner-ai.git` (branch: `main`)
