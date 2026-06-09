# Digital D&D Table — Development Plan

## Context

The existing R3F codebase is a proof-of-concept single-browser terrain editor: paintable ground textures, 3D model placement, grid overlay, rain, scene save/load to JSON. It becomes the foundation of the **Control Client** scene renderer.

The goal is to evolve it into a three-part system:
- **Control Client** — DM's browser. Full editor. Sends state mutations.
- **Display Client** — TV/table browser. Read-only. Receives real-time state pushes.
- **Server** — Supabase (Postgres + Realtime + Storage). Runs locally via Docker or hosted for cloud.

Both clients are the **same Next.js app**, differentiated by route (`/control/[tableId]` vs `/display/[tableId]`).

---

## Architecture Decisions (settled)

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SSR routing for `/control` and `/display` views; replaces Vite |
| Real-time | **Supabase Realtime** | WebSocket pub/sub built into Supabase; same client for local and cloud |
| Database | **Supabase (Postgres)** | Local via Docker Compose; swap to Supabase hosted for cloud via env vars |
| Asset storage | **Supabase Storage** | Same swap; handles map image uploads |
| Auth | **Supabase Auth** | Disabled/bypassed for LAN; enabled for future cloud/SaaS |
| 3D rendering | **React Three Fiber (existing)** | Stays; Three.js is the right choice for the scene |
| Monorepo | **This repo** | All code here; push to GitHub |
| Local dev | `supabase start` + `next dev` | Supabase CLI spins up full local Docker stack |
| LAN deployment | Docker Compose on NAS/M3 | Supabase stack + Next.js container |
| Cloud (future) | Supabase hosted + Vercel | Just env var swap; no code changes |
| Display hardware | Pi / TV browser | Chromium pointing at server URL — no server load on Pi |

### Key principle: same app, two modes

The Next.js app detects its mode from the route:
- `/control/[tableId]` — renders the R3F scene + leva control panels + all editing tools
- `/display/[tableId]` — renders the R3F scene only; no leva, no controls; WebSocket receive-only

The Three.js scene is identical in both. The control client writes state to Supabase; the display client subscribes to Supabase Realtime and re-renders on push.

### Env var switching (local ↔ cloud)

```bash
# Local / LAN (.env.local)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service key>

# Cloud (.env.production)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<project anon key>
SUPABASE_SERVICE_ROLE_KEY=<project service key>
```

Zero code changes between environments.

### LAN deployment (NAS / dedicated machine)

```bash
cd docker
cp .env.example .env          # edit HOST_IP, POSTGRES_PASSWORD, secrets
docker compose up -d          # starts postgres, realtime, postgrest, nginx, next.js
# App at http://<HOST_IP>:3000
# DM:      /setup  →  /control/[tableId]
# Display: /display/[tableId]   (QR code shown on /setup)
```

The `migrate` container applies `supabase/migrations/*.sql` automatically on first boot. Data persists in the `db-data` Docker volume. To rebuild the Next.js image after code changes: `docker compose build web && docker compose up -d web`.

---

## Monorepo Structure

```
/ (repo root)
├── apps/
│   └── web/                          # Next.js app (migrated from current Vite app)
│       ├── src/
│       │   ├── app/
│       │   │   ├── control/
│       │   │   │   └── [tableId]/
│       │   │   │       └── page.tsx  # DM view — scene + leva + all tools
│       │   │   ├── display/
│       │   │   │   └── [tableId]/
│       │   │   │       └── page.tsx  # TV view — scene only, read-only
│       │   │   ├── setup/
│       │   │   │   └── page.tsx      # Create/join table; shows QR code for display URL
│       │   │   └── layout.tsx
│       │   ├── components/
│       │   │   └── scene/            # R3F components (migrated from src/)
│       │   │       ├── SceneCanvas.tsx     # <Canvas> wrapper, dynamic import (ssr: false)
│       │   │       ├── Ground.tsx          # Base image layer + paintable texture overlays
│       │   │       ├── FogLayer.tsx        # Fog of War (DataTexture mask, same pattern as Ground)
│       │   │       ├── Scatter.tsx         # Auto-seeded vegetation
│       │   │       ├── ObjectPainter.tsx   # 3D model placement
│       │   │       ├── BattleGrid.tsx      # Grid overlay
│       │   │       └── Rain.tsx            # Weather
│       │   └── lib/
│       │       ├── supabase/
│       │       │   ├── client.ts           # createBrowserClient()
│       │       │   └── server.ts           # createServerClient() for API routes
│       │       └── sync/
│       │           ├── useSceneSync.ts     # Realtime subscription hook (display)
│       │           └── useScenePublish.ts  # Publish state mutations (control)
├── packages/
│   └── types/                        # Shared TypeScript types (imported by web)
│       └── src/
│           ├── scene.ts              # Scene, Layer, PlacedObject, FogMask, etc.
│           └── messages.ts           # Realtime message payloads
├── supabase/
│   ├── config.toml                   # Supabase CLI config
│   └── migrations/                   # SQL migrations (drizzle or raw SQL)
├── docker/
│   └── docker-compose.yml            # LAN production: Supabase stack + Next.js
├── docs/
│   └── dev-plan.md                   # This file
├── CLAUDE.md
└── package.json                      # Workspace root (npm workspaces or pnpm)
```

---

## Data Model

### Supabase Tables

```sql
-- A physical table setup (one per DnD table)
table_config (
  id          uuid primary key,
  name        text,
  secret_key  text,               -- QR code auth for control client (LAN mode)
  screen_w_in numeric,            -- physical screen width in inches
  screen_h_in numeric,
  is_paused   boolean default false,
  pause_image_url text,
  active_scene_id uuid,
  created_at  timestamptz
)

-- Uploaded map images and other assets
asset (
  id          uuid primary key,
  table_id    uuid references table_config,
  storage_key text,               -- Supabase Storage path
  filename    text,
  mime_type   text,
  width_px    int,
  height_px   int,
  file_size   int,
  created_at  timestamptz
)

-- A scene is one map configuration (terrain, fog, objects, etc.)
scene (
  id          uuid primary key,
  table_id    uuid references table_config,
  name        text,
  sort_order  int,
  -- Base map (optional flat image)
  map_asset_id uuid references asset,
  map_scale   numeric default 1,
  map_offset_x numeric default 0,
  map_offset_y numeric default 0,
  map_rotation int default 0,     -- 0 / 90 / 180 / 270
  -- Terrain paint state (existing system)
  terrain     jsonb,              -- { textures: string[], layers: base64[] }
  -- 3D placed objects (existing system)
  objects     jsonb,              -- PlacedObject[]
  -- Fog of War
  fog_mask    text,               -- base64 PNG (same encoding as terrain masks)
  fog_opacity numeric default 0.85,
  -- Grid
  grid_enabled   boolean default false,
  grid_type      text default 'square',
  grid_color     text default '#ffffff',
  grid_opacity   numeric default 0.3,
  -- Scene config
  weather     text default 'none',
  bg_color    text default '#000000',
  created_at  timestamptz,
  updated_at  timestamptz
)
```

### Realtime Message Protocol

Defined in `packages/types/src/messages.ts`:

```ts
// Control → Supabase channel (broadcast)
type ControlMessage =
  | { type: 'SCENE_ACTIVATE';   payload: { sceneId: string } }
  | { type: 'SCENE_PATCH';      payload: { sceneId: string; patch: Partial<Scene> } }
  | { type: 'TERRAIN_UPDATE';   payload: { sceneId: string; terrain: TerrainState } }
  | { type: 'FOG_UPDATE';       payload: { sceneId: string; fogMask: string } }      // base64 PNG
  | { type: 'OBJECTS_UPDATE';   payload: { sceneId: string; objects: PlacedObject[] } }
  | { type: 'PAUSE_TOGGLE';     payload: { isPaused: boolean } }
  | { type: 'FORCE_FULL_SYNC';  payload: { scene: Scene } }                          // drift recovery

// Server → all subscribers (Supabase broadcasts back to all clients on the channel)
type DisplayMessage =
  | { type: 'STATE_SYNC';       payload: { scene: Scene; isPaused: boolean } }       // on connect
  | { type: 'SCENE_ACTIVATED';  payload: { sceneId: string } }
  | { type: 'SCENE_PATCHED';    payload: { sceneId: string; patch: Partial<Scene> } }
  | { type: 'TERRAIN_UPDATED';  payload: { sceneId: string; terrain: TerrainState } }
  | { type: 'FOG_UPDATED';      payload: { sceneId: string; fogMask: string } }
  | { type: 'OBJECTS_UPDATED';  payload: { sceneId: string; objects: PlacedObject[] } }
  | { type: 'PAUSE_CHANGED';    payload: { isPaused: boolean } }
```

**Drift recovery:** display client sends a `FORCE_FULL_SYNC` request if it detects it has missed messages (sequence gap or on reconnect). Control client responds with the full current scene state.

**Debounce:** terrain paint and fog brush strokes are debounced 100ms before publishing to the Realtime channel, and 500ms before persisting to the DB.

---

## Scene Rendering — What Changes from the PoC

### Base map image layer (new)

`Ground.tsx` gains an optional base image layer rendered below the existing painted textures:

```
Ground plane stack (bottom to top, renderOrder):
  [-13] Base map image (flat PNG/JPG/GIF as ground texture) — optional
  [-12] Grass base texture (existing)
  [-11..0] Painted texture overlays (existing, 12 layers)
  [0]   Scatter blob shadows
  [1]   Placed object blob shadows
  [2]   Fog of War plane (new)
  [3]   Grid overlay (existing BattleGrid)
```

The map image is set as the `map` on a `MeshStandardMaterial` on the ground plane. Scale, offset, and rotation are controlled from the leva panel in control mode and driven by scene state in display mode.

### Fog of War (new — `FogLayer.tsx`)

Uses the **identical system** to the existing road texture masks (`DataTexture`, `applyBrush`, `encodeMask`/`decodeMask`):
- A `DataTexture` (512×512) acts as the alpha mask
- A `MeshBasicMaterial` with the mask as `alphaMap` covers the whole ground plane
- `renderOrder={2}` puts it above everything else
- Control client paints fog in real-time; the encoded mask is broadcast to display
- Display client decodes and applies the incoming mask — same `decodeMask()` function from `Ground.tsx`
- DM can set separate fog opacity for their own view vs the display

### Display mode differences

In `/display/[tableId]`:
- No leva panels rendered
- `OrbitControls` disabled (no pan/zoom)
- Pointer events on hit meshes disabled
- Scene state driven entirely by `useSceneSync` hook (Supabase Realtime subscription)
- Camera position and FOV set from `table_config.screen_w_in / screen_h_in` — same `CameraController` logic as existing

---

## Sync Architecture

```
Control client
  ├── User paints fog
  ├── applyBrush() updates local DataTexture (immediate, 60fps)
  ├── [100ms debounce] → encodeMask() → publish FOG_UPDATE to Supabase Realtime channel
  └── [500ms debounce] → persist fog_mask to scene row in DB

Supabase Realtime channel: `table:{tableId}`
  └── broadcasts FOG_UPDATED to all subscribers

Display client
  ├── receives FOG_UPDATED
  ├── decodeMask() → updates local DataTexture
  └── Three.js renders updated fog — target < 150ms end-to-end on LAN

On display connect / reconnect:
  └── fetch full scene row from DB → STATE_SYNC → render from scratch (no drift)
```

---

## Multi-Scene and Multi-Session Model

Each user can have multiple **sessions** (table_config rows) — e.g. "Basement Campaign", "Kitchen One-Shot". Within each session there are multiple **scenes** (maps/layouts) that can be saved, renamed, reordered, and activated at will. The active scene is what the display client shows.

- **Session list**: shown on `/setup` — all table_configs the user has created, each linking to its control view. For now scoped by localStorage (no auth); with auth (M6) scoped by user.
- **Scene list**: sidebar in the control view listing all scenes for the active session. DM can add, rename, delete, reorder, and switch scenes. Switching activates the scene for the display in real-time.
- One scene is always "active" per session (`table_config.active_scene_id`). Display always shows the active scene.

---

## Milestones

### Milestone 0 — Already done
The R3F terrain editor PoC: painted textures, 3D model placement, grid, rain, scene save/load JSON.

---

### Milestone 1 — Monorepo + Next.js Migration ✅

**Goal:** same visual output as today, in the new structure, with no sync yet.

- [x] Set up monorepo (npm/pnpm workspaces): `apps/web`, `packages/types`
- [x] Scaffold Next.js app in `apps/web` with TypeScript
- [x] Migrate R3F components to `apps/web/src/components/scene/` as `.tsx`
- [x] `SceneCanvas.tsx`: wrap `<Canvas>` with `dynamic(..., { ssr: false })`
- [x] `/control/[tableId]` route: renders full scene + leva panels (current App.jsx behaviour)
- [x] `/display/[tableId]` route: renders scene only, no controls, no pointer events
- [x] `/setup` route: placeholder page (table name input, generates tableId)
- [x] `packages/types`: define `Scene`, `PlacedObject`, `TerrainState`, `FogMask`, all Realtime message types
- [x] Delete Vite config; update scripts in root `package.json`

---

### Milestone 2 — Supabase + Persistence ✅

**Goal:** scene state lives in Supabase, survives browser refresh.

- [x] Supabase project setup: `supabase init`, migrations for `table_config`, `asset`, `scene`
- [x] `/setup`: create table in DB, display QR code for `/display/[tableId]` URL
- [x] Control client saves scene state to DB on change (debounced 500ms via `useSceneDB`)
- [x] Control client loads scene state from DB on mount (creates default scene if none exists)
- [x] Replace local JSON save/load with DB read/write
- [x] `docker-compose.yml`: Supabase stack (postgres, PostgREST, Realtime, nginx) + Next.js container
- [ ] `/setup`: list existing sessions per user — deferred to M4 with scene list UI
- [ ] Supabase Storage: map image upload — deferred to M4 (needed for base map feature)

---

### Milestone 3 — Real-time Sync ✅

**Goal:** control client changes appear on display client in real-time.

- [x] `useScenePublish` hook: publishes Realtime messages on state change (100ms debounce)
- [x] `useSceneSync` hook: subscribes to Realtime channel, applies incoming messages to local state
- [x] Display client: full scene fetch from DB on connect (drift prevention)
- [x] Terrain paint sync: `TERRAIN_UPDATED` broadcast
- [x] Placed objects sync: `OBJECTS_UPDATED` broadcast
- [x] DisplayScene: rewritten — camera from screen dims in DB, PlacedObjectsRenderer for read-only objects
- [x] Lighting sync: hemisphere colors/intensity, sun color/intensity/azimuth/elevation — all synced via `STATE_UPDATED`
- [x] Shadow mode sync: Blob / Soft Shadows / SSAO / combined — display mirrors control exactly
- [x] Fog sync: enabled flag, color, density — display matches control
- [x] Wind sync: speed and strength broadcast to display
- [x] Blob size/opacity sync
- [x] Fog of War sync — `FOG_UPDATED` broadcast (100ms debounce); `fowColor`/`fowDisplayOpacity` in `STATE_UPDATED`
- [x] Scene activate sync — `SCENE_ACTIVATE` broadcast; display fetches and applies new scene from DB
- [ ] Pause/resume sync — deferred to M4 (pause feature not built yet)
- [ ] `FORCE_FULL_SYNC` — deferred to M5 polish

---

### Milestone 4 — Scene Features

**Goal:** feature parity with the spec's Milestone 1 feature set.

- [ ] **Base map image**: upload PNG/JPG, set as ground texture; scale/offset/rotation controls
- [x] **Fog of War**: `FogLayer.tsx` using DataTexture mask; brush + rect-select tools; DM vs player opacity; syncs in real-time via `FOG_UPDATED`; persists to `fog_mask` DB column
- [x] **Object snap-to-grid**: toggle in Object Painting panel; snaps placed object positions and cursor to nearest integer grid cell
- [x] **Scene list**: `SceneList.tsx` overlay panel (top-left); click to switch, double-click to rename, × to delete, + New Scene
- [x] **Multi-scene management**: add, delete, rename; `switchScene` saves current, clears 3D state, loads new scene via ioRefs; `active_scene_id` updated in DB
- [ ] **Pause screen**: control client toggles; display shows configurable overlay image
- [ ] **Display calibration UI**: set physical screen dimensions in setup/table settings

---

### Milestone 5 — Polish + LAN Deployment Docs

- [ ] Auto-reconnect on display client with exponential backoff; "Waiting for GM" overlay
- [ ] Docker Compose documented and tested on NAS
- [ ] Pi kiosk setup guide (Chromium `--kiosk --app=http://NAS_IP:3000/display/TABLE_ID`)
- [ ] Environment variable reference doc
- [ ] `FORCE_FULL_SYNC` button in control client UI for manual drift recovery

---

### Milestone 6 — Cloud + Auth (future)

- [ ] Swap to Supabase hosted via env vars; verify everything works
- [ ] Supabase Auth: email/password for control client in cloud mode
- [ ] Row-Level Security: tables isolated by user ownership
- [ ] Vercel deployment for Next.js app
- [ ] Multi-table support (already in data model; just needs auth isolation)
- [ ] Stripe integration for subscription model (optional)

---

## Developer Tooling

### Log forwarding (`/api/log`) ✅
A POST endpoint that writes structured client-side log entries to the Next.js server stdout. Both control and display hooks call `remoteLog(source, event, data)` at key sync points — state published, terrain published, objects published, and all three received. All logs land in the single `npm run dev` terminal with `[HH:MM:SS.mmm] [source] EVENT {data}` format.

### Channel monitor (`/debug/[tableId]`) ✅
A dev-only page that subscribes to the Supabase Realtime channel and renders a live scrolling log of every broadcast event with timestamps and summarized payloads (base64 blobs redacted). Color-coded by event type. Useful for verifying sync round-trips without needing the 3D scene to look correct in a screenshot.

### Playwright test suite (planned)

**Goal:** fast, reliable CI coverage of sync and rendering without manual browser inspection.

**Approach:** tests run against a real local Supabase stack (`supabase start`). No mocking of the Realtime channel — tests exercise the real broadcast path.

**Planned test cases:**

| Test | What it verifies |
|---|---|
| Control page smoke | `/control/[tableId]` loads, canvas renders, no JS errors |
| Display page smoke | `/display/[tableId]` loads, canvas renders, no JS errors |
| Debug page connects | `/debug/[tableId]` shows `● connected` within 3s |
| State sync round-trip | Control broadcasts STATE_UPDATED; debug page receives it within 2s |
| Terrain sync round-trip | Control paint stroke triggers TERRAIN_UPDATED; debug page receives it |
| Objects sync round-trip | Control places an object; OBJECTS_UPDATED appears in debug page log |
| bgColor sync | Control changes bg color; display `<div>` background style updates |
| Grid sync | Control toggles grid; `showGrid` field appears in debug log |

**Implementation notes:**
- Use `@playwright/test` with `webServer` config pointing at `npm run dev`
- The debug page is the assertion surface for sync tests — poll for expected event text in the log entries rather than inspecting 3D canvas state
- Screenshot control and display pages for visual regression baseline
- Supabase must be running locally; skip sync tests with `test.skip` if `SUPABASE_URL` env is absent

---

## Non-Functional Targets

| Metric | Target |
|---|---|
| Fog/terrain update → display render | < 150ms on LAN |
| Display frame rate | 60fps during active combat |
| Map upload size | up to 50MB |
| Realtime debounce (publish) | 100ms |
| DB persist debounce | 500ms |
| Reconnect behaviour | Auto-reconnect; display never needs manual refresh |

---

## Open Questions (deferred)

- **Map video support** (GIF/MP4/WebM as base map) — Three.js `VideoTexture` is feasible; deferred to post-M4
- **Offline PWA for display** — service worker caching last known scene; deferred to M5+
- **Drawing / annotation layer** — freehand on map; similar to fog system; M6+
- **Dynamic lighting** — placeable light sources; Three.js `PointLight` instances; M6+
- **Initiative tracker widget** — M6+
- **Measurement tools** — M6+
