# Trip Planner AI — Claude Code Reference

## Project Overview

A **generic Group Holiday Planner** PWA. An organiser creates a trip and shares a group code (e.g. `FARO-XK3M`) or QR code. Members join by entering the code and selecting their name. No authentication in Phase 1/2 — roles stored in localStorage.

**GitHub:** https://github.com/Sharusan17/trip-planner-ai

### Phase Status
- **Phase 1** ✅ Complete — Trip creation/joining, itinerary, map, weather, currency
- **Phase 2** 🚧 In progress — Expenses, settlements, transport, accommodation, deposits
- **Phase 3** ⏳ Planned — Announcements, polls, push notifications, photo album
- **Phase 4** ⏳ Planned — AI assistant (Claude API), local events, deals finder

---

## Monorepo Structure

```
trip-planner-ai/
├── shared/          @trip-planner-ai/shared — TypeScript types only (no build step)
├── server/          Express + TypeScript + PostgreSQL (port 3001)
└── client/          React 19 + Vite + Tailwind CSS v4 (port 5173)
```

Root workspace config at `package.json` uses npm workspaces.

---

## Running the Project

> **IMPORTANT:** Node is installed via nvm. Every bash command must be prefixed:
> ```bash
> export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
> ```

### Dev (both server + client concurrently)
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm run dev
```

### Server only
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm run dev:server
```

### Client only
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm run dev:client
```

### Run DB migrations
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm run migrate -w server
```

### Seed demo data (Faro trip, 10 travellers, 3 days)
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm run seed -w server
```

### Build
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm run build
```

---

## Environment Setup

### PostgreSQL (via pgAdmin4)
Create a database and set `DATABASE_URL` in `server/.env`:
```
DATABASE_URL=postgresql://localhost:5432/trip_planner_dev
PORT=3001
EXCHANGE_RATE_API_KEY=
```

Run migrations after creating the DB: `npm run migrate -w server`

### Supabase (Phase 4)
`@supabase/supabase-js` is installed in client but not yet wired. Auth integration is planned for Phase 4.

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
- Dev: `http://localhost:3001/api/v1` (proxied via Vite: `/api` → `:3001`)
- All routes: `/api/v1/trips`, `/api/v1/travellers`, etc.

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
| Maps | Leaflet + react-leaflet |
| Drag & Drop | @dnd-kit |
| QR Codes | qrcode.react |
| Backend | Express 4, TypeScript, Node.js |
| Database | PostgreSQL (pg pool) |
| Auth (future) | Supabase |
| Weather API | Open-Meteo (free, no key) |
| Currency API | open.er-api.com (free, no key) |

---

## Vintage Theme Classes

Defined in `client/src/styles/globals.css`. Always use these — do not add inline Tailwind for card/button patterns.

| Class | Use |
|-------|-----|
| `.vintage-card` | Main content container |
| `.btn-primary` | Navy filled button |
| `.btn-secondary` | Parchment outlined button |
| `.btn-danger` | Terracotta button |
| `.vintage-input` | Form inputs |
| `.badge` | Base badge |
| `.badge-navy` | Navy badge |
| `.badge-gold` | Gold badge |
| `.badge-terracotta` | Terracotta/red badge |
| `.status-badge-pending` | Deposit/settlement pending |
| `.status-badge-paid` | Deposit/settlement paid |
| `.status-badge-overdue` | Deposit overdue |
| `.progress-bar-track` | Budget progress track |
| `.progress-bar-fill` | Budget progress fill |

### Colour Tokens
```
--color-parchment: #F5E6C8  (main bg)
--color-navy:      #1B3A5C  (primary)
--color-terracotta:#C65D3E  (accent/danger)
--color-gold:      #B8963E  (secondary)
--color-ink:       #2C2417  (text)
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
1. Create `client/src/pages/[Name]Page.tsx`
2. Add `<Route path="/path" element={<NamePage />} />` inside `<AppShell>` in `client/src/App.tsx`
3. Add to `navItems` array in `client/src/components/layout/Sidebar.tsx`

### Adding a new client API module
1. Create `client/src/api/[resource].ts`
2. Import from `client.ts` base: `import { api } from './client'`

---

## Git Commits

- No `Co-Authored-By` lines
- Conventional commit style: `feat:`, `fix:`, `chore:`
- Push to: `https://github.com/Sharusan17/trip-planner-ai.git` (branch: `master`)
