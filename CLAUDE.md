# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# R3F Battle Map — Project Guide for Claude

## What This Is

A top-down 3D battle map scene for tabletop gaming, built with React Three Fiber. The user designs terrain (painted ground textures, placed 3D objects) and the result is displayed on a physical TV screen on the gaming table. Scenes can be saved and loaded as JSON.

## Stack

- React 19, Vite
- `@react-three/fiber` v9, Three.js r184
- `@react-three/drei`, `leva` (controls UI), `@react-three/postprocessing` (SSAO)
- Top-down orthographic-ish camera (perspective, looking straight down with near-zero tilt)

## Running

```bash
npm run dev      # start Next.js dev server (Turbopack, hot reload) — always use run_in_background: true
npm run build    # production build
npm run lint     # ESLint
```

All commands run from the repo root and delegate to `apps/web` via npm workspaces.

## Monorepo Structure

```
apps/web/                         # Next.js app (TypeScript)
  src/
    app/
      control/[tableId]/page.tsx  # DM view — full scene + leva panels
      display/[tableId]/page.tsx  # TV view — scene only, no controls
      setup/page.tsx              # table creation (M1: local UUID; M2: Supabase)
    components/scene/
      ControlScene.tsx            # Root for control route — leva panels, lighting, save/load
      DisplayScene.tsx            # Root for display route — read-only, no leva
      Ground.tsx                  # Grass base + paintable road texture overlays
      Scatter.tsx                 # Auto-seeded KayKit vegetation + wind shader + InstancedModel
      ObjectPainter.tsx           # 3D object painting tool — click/drag to place models
      BattleGrid.tsx              # Overlay grid scaled to physical screen size
      Rain.tsx                    # Particle rain streaks + ground ripple effect
    lib/sync/
      useSceneSync.ts             # M1: stub. M3: Supabase Realtime subscription for display
  public/
    models/                       # GLTF/GLB model assets
    textures/                     # PBR texture assets
packages/types/
  src/
    scene.ts                      # Scene, PlacedObject, TableConfig, etc.
    messages.ts                   # ControlMessage / DisplayMessage Realtime protocol types
    index.ts
docs/
  dev-plan.md                     # Architecture decisions and milestone breakdown
```

## Public Assets (in apps/web/public/)

```
models/
  kaykit/          14 GLTF models (KayKit Nature Pack) — trees, bushes, grass, flowers
  foliage/         33 GLB models (FBX pack, converted via Blender headless)
  rocks/           17 GLB models (geometry-only, AP2 rock pack)

textures/
  moss_ground_03_*/   Base grass layer (always visible)
  ground_stones_*/    Road/path textures (12 total, used in Ground.tsx)
  rocks/              Shared atlas for all 17 rock models (basecolor/normal/roughness)
```

KayKit models have embedded material data (roughness ≈ 0.5). FBX-converted foliage GLBs have NO material data — Three.js default roughness=1.0. `ObjectPainter.tsx` applies `FOLIAGE_MAT` (`roughness: 0.5, color: 0x6fa33c`) to any untextured mesh.

## Coordinate System

**1 world unit = 1 inch** — this is the fundamental scale. Screen sizes (`SCREEN_SIZES` in `BattleGrid.jsx`) store physical dimensions in inches, which map 1:1 to Three.js world units. The D&D grid is 1 unit per square (1 inch = 1 five-foot square at tabletop scale).

`GROUND_SIZE = 80` in `Ground.jsx` is intentionally larger than any supported screen (max 74" wide) — this gives room to paint terrain right to the edge and slightly beyond without hitting the ground boundary.

## Architecture Patterns

### leva panel merging
Multiple `useControls('Panel Name', ...)` calls with the same name merge into one UI panel. App.jsx owns the `objectPaintMode` toggle; ObjectPainter.jsx owns the rest of the Object Painting controls. Same pattern for Road Painting (App + Ground).

### ioRef save/load pattern
App.jsx holds `groundIO = useRef()` and `objectsIO = useRef()`. Each component registers `{ save, load }` functions on its ref via `useEffect`. Scene save/load calls both refs. This avoids prop-drilling state and keeps each component owning its data.

### Wind shader
`Scatter.jsx` exports `grassWindUniforms`, `applyGrassWind(material)`, and `applyWindToGrassScene(scene)`. All grass (seeded by Scatter and manually placed by ObjectPainter) shares the same uniform object, so `Scatter`'s `useFrame` tick drives all grass wind in sync.

`applyWindToGrassScene` only targets materials where `mat.name === 'Grass'` — safe to call on any model. It's idempotent (`_windApplied` flag).

### InstancedModel (Scatter.jsx)
Reusable component for instanced rendering of a GLTF scene. `args` uses a fixed `MAX_INSTANCES = 1000` — **never use `instances.length` as the args count**, that recreates the GPU buffer on every paint stroke and crashes the app. `mesh.count` controls how many instances render.

### Hit mesh pattern
Both `Ground.tsx` and `ObjectPainter.tsx` use a transparent invisible plane (`meshBasicMaterial transparent opacity={0} depthWrite={false}`) as the sole target for pointer events. This keeps the 3D models out of the raycaster hit path and gives a clean flat surface for UV/point coordinates during painting.

### Shadow map baking (App.jsx)
When not actively painting objects, `light.shadow.autoUpdate = false` is set so the shadow map is only re-rendered on explicit `needsUpdate = true` triggers (sun direction/frustum changes). While `objectPaintMode` is on, `autoUpdate` is re-enabled for live feedback. This avoids a full shadow map re-render every frame.

### InstancedModel instance format
`InstancedModel` (in `Scatter.tsx`) accepts two instance formats in its `instances` array:
- `{ position: THREE.Vector3, rotation/ry, scale/s }` — used by ObjectPainter
- `{ x, z, ry, s }` — used by Scatter's internal scatter() output

Both are supported by the `useEffect` in `InstancedModel`.

### Placed object blob shadows (ObjectPainter)
Uses `THREE.InstancedMesh` with `MAX_PLACED = 2000` fixed allocation. `renderOrder={1}` ensures placed blobs render after Scatter's seeded blobs (`renderOrder=0`). Stencil gate (`NotEqualStencilFunc`, ref=1) prevents multiple placed blobs from stacking darkness on the same pixel — the first placed blob shadow to touch a pixel wins; this works because Scatter blobs don't write stencil.

## Shadow System

Three shadow modes (Shadows leva panel):

| Mode | Mechanism |
|---|---|
| **Blob** | Flat gradient circle under each object. Fast, always on. Scatter blobs auto-generated, placed-object blobs from ObjectPainter. |
| **Soft Shadows** | Directional light `castShadow`, all meshes use `receiveShadow`. Road overlay meshes must have `receiveShadow` set or shadows won't appear over painted textures. |
| **SSAO** | Screen-space AO via N8AO postprocessing. Can combine with Soft Shadows. |

## Rendering Order (important)

Ground layers use `renderOrder={i - N}` (negative) to render in the transparent pass BEFORE the blob shadows (`renderOrder=0` for Scatter, `renderOrder=1` for ObjectPainter). All are transparent objects. Road overlays use `depthWrite: true` to write depth correctly for stacking layers.

## Scene Save Format (v2)

```json
{
  "version": 2,
  "textures": ["Ground Stones 02", ...],
  "layers": ["data:image/png;base64,..."],
  "objects": [
    { "path": "/models/kaykit/BirchTree_1.gltf", "x": 3.2, "y": 0, "z": -1.4,
      "ry": 1.57, "scale": 0.5, "shadowType": "tree" }
  ]
}
```

Masks are base64 PNG (grayscale, G-channel = painted alpha). Objects are loaded back via `ioRef` registered in ObjectPainter.

## Object Catalog (ObjectPainter)

51 entries total. Each has `defaultScale` (scale slider auto-snaps on selection) and `shadowType` (used to size blob shadow disc):

- Trees (KayKit + F1): `defaultScale: 0.5`, `shadowType: 'tree'` (2.4× disc)
- Dead trees: `defaultScale: 0.5`, `shadowType: 'dead'` (1.6×)
- Bushes: `defaultScale: 1.0`, `shadowType: 'bush'` (1.1×)
- Grass / flowers / rocks: `defaultScale: 1.0–1.1`, `shadowType: 'cover'` (0.65×)

## Known Limitations / Gotchas

- FBX rock GLBs are geometry-only (8–28 KB). Textures must be applied manually in `RockObject` via the shared atlas in `public/textures/rocks/`.
- `scene.clone(true)` shares materials by reference. Calling `applyWindToGrassScene` on a clone is safe (idempotent), and the cloned grass inherits the already-compiled wind shader.
- The `useControls` function-form `useControls('Panel', () => ({...}))` returns `[data, set]`, enabling programmatic updates (e.g. scale slider snap). The plain object form just returns `data`.
- Scatter's `InstancedModel` component: `meshes` (geometry/material list) is memoized on `scene`. It will NOT recompute if only `instances` changes — that's intentional and correct.
- `ObjectPainter` is NOT rendered in `DisplayScene` — it registers leva controls unconditionally. The display route will get a separate read-only `PlacedObjectsRenderer` in M3.
- Both page routes (`/control/[tableId]` and `/display/[tableId]`) are `'use client'` components using React 19's `use(params)` to unwrap the async params, then `dynamic(..., { ssr: false })` to load the Three.js scene.
