# R3F Battle Map

Top-down 3D terrain editor for tabletop gaming. Design battle maps with painted ground textures and 3D placed objects, then display them on a physical TV screen at the table.

## Features

- **Ground texture painting** — 12 paintable texture layers (stone paths, tiles, sand, moss, water…) with soft brush and erase
- **3D object placement** — click/drag to scatter trees, bushes, grass, rocks with adjustable density and brush size
- **51-model catalog** — KayKit Nature Pack (full quality, wind-animated grass), FBX foliage pack (33 GLBs), AP2 rock pack (17 GLBs with shared texture atlas)
- **Wind-animated grass** — all grass sways in sync, whether seeded or manually placed
- **Auto-seeded vegetation** — Scatter component places trees, bushes, and ground cover at startup with Poisson-disc spacing
- **Shadow modes** — Blob (fast gradient discs), Soft Shadows (directional light shadow map), SSAO, or combinations
- **Custom lighting** — hemisphere sky/ground light, adjustable sun azimuth/elevation, optional fog
- **Rain** — particle streaks + ground ripple effect
- **Battle grid** — scaled to physical screen size (25", 32", 43", 55", 65" presets)
- **Scene save/load** — saves texture masks + placed objects to a single JSON file

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Controls are in the leva panel (top-right).

## Controls

| Panel | Controls |
|---|---|
| **Scene** | Save Scene / Load Scene |
| **Object Painting** | Toggle paint mode, select model, scale, brush size, density, undo, clear |
| **Road Painting** | Toggle paint mode, select texture, brush size/opacity, erase |
| **Shadows** | Mode (Blob/Soft Shadows/SSAO), blob size/opacity, shadow softness, AO settings |
| **Lighting** | Sky color, ambient light, sun color/intensity/position, fog |
| **View** | Screen size, FOV, grid toggle, re-center |
| **Grass** | Wind speed and strength |
| **Weather** | Rain intensity |

## Stack

- React 19 + Vite
- React Three Fiber v9, Three.js r184
- @react-three/drei, @react-three/postprocessing
- Leva (controls UI)

## Asset Credits

- [KayKit Nature Pack](https://kaylousberg.itch.io/) — trees, bushes, grass, flowers
- FBX Foliage Pack (Unity Asset Store) — converted to GLB via Blender
- AP2 Rock Pack (Unity Asset Store) — converted to GLB via Blender
- Ground textures — [ambientCG](https://ambientcg.com/)
