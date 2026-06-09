'use client'

import { Suspense, useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { GLTF } from 'three-stdlib'
import { InstancedModel } from './Scatter'
import { applyWindByType, type WindType } from './wind'
import type { PlacedObject, ShadowType } from '@dnd-table/types'

// ── asset catalog ─────────────────────────────────────────────────────────────

interface CatalogEntry {
  label: string
  path: string
  defaultScale: number
  shadowType: ShadowType
}

export const OBJECT_CATALOG: CatalogEntry[] = [
  // ── KayKit ───────────────────────────────────────────────────────────────
  { label: 'Birch Tree 1',    path: '/models/kaykit/BirchTree_1.gltf',    defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'Birch Tree 2',    path: '/models/kaykit/BirchTree_2.gltf',    defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'Birch Tree 3',    path: '/models/kaykit/BirchTree_3.gltf',    defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'Maple Tree 1',    path: '/models/kaykit/MapleTree_1.gltf',    defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'Maple Tree 2',    path: '/models/kaykit/MapleTree_2.gltf',    defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'Dead Tree 1',     path: '/models/kaykit/DeadTree_1.gltf',     defaultScale: 0.5, shadowType: 'dead'  },
  { label: 'Dead Tree 2',     path: '/models/kaykit/DeadTree_2.gltf',     defaultScale: 0.5, shadowType: 'dead'  },
  { label: 'Bush',            path: '/models/kaykit/Bush.gltf',           defaultScale: 1.0, shadowType: 'bush'  },
  { label: 'Bush (Large)',    path: '/models/kaykit/Bush_Large.gltf',     defaultScale: 1.0, shadowType: 'bush'  },
  { label: 'Bush (Flowers)',  path: '/models/kaykit/Bush_Flowers.gltf',   defaultScale: 1.0, shadowType: 'bush'  },
  { label: 'Grass (Large)',   path: '/models/kaykit/Grass_Large.gltf',    defaultScale: 1.1, shadowType: 'cover' },
  { label: 'Grass (Small)',   path: '/models/kaykit/Grass_Small.gltf',    defaultScale: 1.1, shadowType: 'cover' },
  { label: 'Flower Clump 1',  path: '/models/kaykit/Flower_1_Clump.gltf', defaultScale: 1.0, shadowType: 'cover' },
  { label: 'Flower Clump 2',  path: '/models/kaykit/Flower_2_Clump.gltf', defaultScale: 1.0, shadowType: 'cover' },
  // ── FBX Foliage pack ─────────────────────────────────────────────────────
  { label: 'F1 Tree 1',          path: '/models/foliage/F1_Tree1.glb',          defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'F1 Tree 2',          path: '/models/foliage/F1_Tree2.glb',          defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'F1 Tree 3',          path: '/models/foliage/F1_Tree3.glb',          defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'F1 Tree 4',          path: '/models/foliage/F1_Tree4.glb',          defaultScale: 0.5, shadowType: 'tree'  },
  { label: 'F1 Bush (High)',     path: '/models/foliage/F1_BushHigh.glb',       defaultScale: 1.0, shadowType: 'bush'  },
  { label: 'F1 Bush (Mid)',      path: '/models/foliage/F1_BushMid.glb',        defaultScale: 1.0, shadowType: 'bush'  },
  { label: 'F1 Bush (Low)',      path: '/models/foliage/F1_BushLow.glb',        defaultScale: 1.0, shadowType: 'bush'  },
  { label: 'F1 Grass (High)',    path: '/models/foliage/F1_HighGrass.glb',      defaultScale: 1.1, shadowType: 'cover' },
  { label: 'F1 Grass (Mid)',     path: '/models/foliage/F1_MidGrass.glb',       defaultScale: 1.1, shadowType: 'cover' },
  { label: 'F1 Grass (Low)',     path: '/models/foliage/F1_LowGrass.glb',       defaultScale: 1.1, shadowType: 'cover' },
  { label: 'F1 Flower Patch 1',  path: '/models/foliage/F1_Flower1Patch.glb',   defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Flower Patch 2',  path: '/models/foliage/F1_Flower2Patch.glb',   defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Flower Patch 3',  path: '/models/foliage/F1_Flower3Patch.glb',   defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Flower Patch 4',  path: '/models/foliage/F1_Flower4Patch.glb',   defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Flower Patch 5',  path: '/models/foliage/F1_Flower5Patch.glb',   defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Foliage Patch 1', path: '/models/foliage/F1_Foliage1Patch.glb',  defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Foliage Patch 2', path: '/models/foliage/F1_Foliage2Patch.glb',  defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Foliage Patch 3', path: '/models/foliage/F1_Foliage3Patch.glb',  defaultScale: 1.0, shadowType: 'cover' },
  { label: 'F1 Foliage Patch 4', path: '/models/foliage/F1_Foliage4Patch.glb',  defaultScale: 1.0, shadowType: 'cover' },
  // ── Rocks ─────────────────────────────────────────────────────────────────
  ...Array.from({ length: 17 }, (_, i) => ({
    label:        `Rock ${i + 1}`,
    path:         `/models/rocks/AP2_Rock${i + 1}_LOD0.glb`,
    defaultScale: 1.0,
    shadowType:   'cover' as ShadowType,
  })),
]

export const OBJECT_LABELS = OBJECT_CATALOG.map(o => o.label)

export const SHADOW_SCALE: Record<ShadowType, number> = { tree: 2.4, dead: 1.6, bush: 1.1, cover: 0.65 }

// ── blob shadow resources ─────────────────────────────────────────────────────

function makeBlobTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx  = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 62)
  grad.addColorStop(0,   'rgba(0,0,0,0.55)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.25)')
  grad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

// Fixed allocation — instancedMesh args must never change at runtime.
export const MAX_PLACED = 2000

const BLOB_TEX = makeBlobTexture()
export const BLOB_GEO = new THREE.CircleGeometry(1, 16)
export const BLOB_MAT = new THREE.MeshBasicMaterial({
  map: BLOB_TEX, transparent: true, depthWrite: false, color: 0x000000,
  stencilWrite: true,
  stencilRef:   1,
  stencilFunc:  THREE.NotEqualStencilFunc,
  stencilFail:  THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
})

// ── instanced placed asset renderers ─────────────────────────────────────────

interface InstancedAssetProps {
  path: string
  instances: PlacedObject[]
  castShadow: boolean
}

function InstancedRockAsset({ path, instances, castShadow }: InstancedAssetProps) {
  const { scene } = useGLTF(path) as GLTF
  const baseColor = useTexture('/textures/rocks/basecolor.png')

  const modifiedScene = useMemo(() => {
    const c   = scene.clone(true)
    // Lambert is faster to compile than Standard; normal map detail on rocks
    // is still clearly visible from the top-down camera angle.
    const mat = new THREE.MeshLambertMaterial({ map: baseColor })
    c.traverse(child => { if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = mat })
    return c
  }, [scene, baseColor])

  return (
    <InstancedModel
      scene={modifiedScene}
      instances={instances}
      castShadow={castShadow}
      receiveShadow={castShadow}
    />
  )
}

function shadowTypeToWindType(st: string): WindType {
  if (st === 'tree') return 'tree'
  if (st === 'dead') return 'dead'
  if (st === 'bush') return 'bush'
  return 'grass'
}

function InstancedFoliageAsset({ path, instances, castShadow }: InstancedAssetProps) {
  const { scene } = useGLTF(path) as GLTF

  const windType = shadowTypeToWindType(
    OBJECT_CATALOG.find(e => e.path === path)?.shadowType ?? 'cover'
  )

  const modifiedScene = useMemo(() => {
    const c = scene.clone(true)
    // Create a per-path MeshLambertMaterial for untextured (FBX pack) meshes,
    // with the correct wind profile already injected.
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x6fa33c })
    applyWindByType(foliageMat as unknown as THREE.Material, windType)
    c.traverse(child => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && !(mesh.material as THREE.MeshStandardMaterial)?.map) {
        mesh.material = foliageMat
      }
    })
    return c
  // windType is derived from path, so path alone is sufficient as dep here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  return (
    <InstancedModel
      scene={modifiedScene}
      instances={instances}
      windType={windType}
      castShadow={castShadow}
      receiveShadow={castShadow}
    />
  )
}

export function InstancedPlacedAsset(props: InstancedAssetProps) {
  return props.path.includes('/rocks/')
    ? <InstancedRockAsset {...props} />
    : <InstancedFoliageAsset {...props} />
}

// ── ioRef type ────────────────────────────────────────────────────────────────

export interface ObjectsIO {
  save:     () => PlacedObject[]
  load:     (objects: PlacedObject[]) => void
  undo:     () => void
  clearAll: () => void
}

// ── main component ────────────────────────────────────────────────────────────

interface ObjectPainterProps {
  objectPaintMode: boolean
  selectedModel:   string
  objectScale:     number
  brushSize:       number
  density:         number
  randomRotation:  boolean
  snapToGrid:      boolean
  ioRef?: React.MutableRefObject<ObjectsIO | undefined>
  castShadow?: boolean
  showBlobs?: boolean
  blobSize?: number
  blobOpacity?: number
  onChange?: () => void
}

export function ObjectPainter({
  objectPaintMode,
  selectedModel,
  objectScale,
  brushSize,
  density,
  randomRotation,
  snapToGrid,
  ioRef,
  castShadow  = false,
  showBlobs   = true,
  blobSize    = 1.0,
  blobOpacity = 1.0,
  onChange,
}: ObjectPainterProps) {
  const placedRef = useRef<PlacedObject[]>([])
  const [placed, setPlaced] = useState<PlacedObject[]>([])

  useEffect(() => { BLOB_MAT.opacity = blobOpacity }, [blobOpacity])

  useEffect(() => {
    if (!ioRef) return
    ioRef.current = {
      save: () => placedRef.current,
      load: (objects) => {
        const loaded = objects.map((o, i) => ({
          ...o,
          id: o.id ?? String(Date.now() + i),
          shadowType: o.shadowType ?? OBJECT_CATALOG.find(e => e.path === o.path)?.shadowType ?? 'cover',
        }))
        placedRef.current = loaded
        setPlaced(loaded)
      },
      undo:     () => { const next = placedRef.current.slice(0, -1); placedRef.current = next; setPlaced(next); onChange?.() },
      clearAll: () => { placedRef.current = []; setPlaced([]); onChange?.() },
    }
  }, [ioRef, onChange])

  useEffect(() => {
    const entry = OBJECT_CATALOG.find(o => o.label === selectedModel)
    if (entry) useGLTF.preload(entry.path)
  }, [selectedModel])

  const isPainting   = useRef(false)
  const lastPaintPos = useRef<{ x: number; z: number } | null>(null)

  useEffect(() => {
    const stop = () => { isPainting.current = false; lastPaintPos.current = null }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const scatterObjects = useCallback((
    cx: number, cz: number, entry: CatalogEntry,
    bSize: number, dens: number, rRotation: boolean, oScale: number,
    snap: boolean,
  ) => {
    const items: PlacedObject[] = Array.from({ length: dens }, () => {
      const angle = Math.random() * Math.PI * 2
      const r     = Math.sqrt(Math.random()) * bSize
      const rawX  = cx + Math.cos(angle) * r
      const rawZ  = cz + Math.sin(angle) * r
      return {
        id:         String(Date.now() + Math.random()),
        path:       entry.path,
        shadowType: entry.shadowType,
        x:          snap ? Math.round(rawX) : rawX,
        y:          0,
        z:          snap ? Math.round(rawZ) : rawZ,
        ry:         rRotation ? Math.random() * Math.PI * 2 : 0,
        scale:      oScale,
      }
    })
    const next = [...placedRef.current, ...items]
    placedRef.current = next
    setPlaced(next)
    onChange?.()
  }, [onChange])

  const cursorRef = useRef<THREE.Mesh>(null)
  const cursorPos = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!cursorRef.current) return
    cursorRef.current.visible = objectPaintMode
    if (objectPaintMode) {
      cursorRef.current.position.set(cursorPos.current.x, 0.05, cursorPos.current.z)
      // In snap mode show a 1-unit cell ring; otherwise scale to brush radius.
      cursorRef.current.scale.set(
        snapToGrid ? 0.5 : brushSize,
        snapToGrid ? 0.5 : brushSize,
        1,
      )
    }
  })

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!objectPaintMode) return
    e.stopPropagation()
    isPainting.current = true
    const entry = OBJECT_CATALOG.find(o => o.label === selectedModel)
    if (!entry) return
    const px = snapToGrid ? Math.round(e.point.x) : e.point.x
    const pz = snapToGrid ? Math.round(e.point.z) : e.point.z
    lastPaintPos.current = { x: px, z: pz }
    scatterObjects(px, pz, entry, brushSize, density, randomRotation, objectScale, snapToGrid)
  }, [objectPaintMode, selectedModel, brushSize, density, randomRotation, objectScale, snapToGrid, scatterObjects])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!objectPaintMode) return
    e.stopPropagation()
    const px = snapToGrid ? Math.round(e.point.x) : e.point.x
    const pz = snapToGrid ? Math.round(e.point.z) : e.point.z
    cursorPos.current.set(px, 0, pz)
    if (!isPainting.current) return
    const last = lastPaintPos.current
    if (!last) return
    const dx = px - last.x
    const dz = pz - last.z
    if (Math.sqrt(dx * dx + dz * dz) < (snapToGrid ? 0.9 : brushSize * 0.4)) return
    const entry = OBJECT_CATALOG.find(o => o.label === selectedModel)
    if (!entry) return
    lastPaintPos.current = { x: px, z: pz }
    scatterObjects(px, pz, entry, brushSize, density, randomRotation, objectScale, snapToGrid)
  }, [objectPaintMode, selectedModel, brushSize, density, randomRotation, objectScale, snapToGrid, scatterObjects])

  const groupedPlaced = useMemo(() => {
    const groups: Record<string, PlacedObject[]> = {}
    placed.forEach(item => {
      if (!groups[item.path]) groups[item.path] = []
      groups[item.path].push(item)
    })
    return Object.keys(groups).map(path => ({ path, list: groups[path] }))
  }, [placed])

  const blobRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = blobRef.current
    if (!mesh || !showBlobs) return
    const dummy = new THREE.Object3D()
    placed.forEach((item, i) => {
      dummy.position.set(item.x, 0.02, item.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      const scale = item.scale * (SHADOW_SCALE[item.shadowType] ?? 1.0) * blobSize
      dummy.scale.set(scale, scale, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = placed.length
  }, [placed, showBlobs, blobSize])

  return (
    <>
      {/* Transparent hit mesh — sole target for pointer events during object painting */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh ref={cursorRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.88, 1, 64]} />
        <meshBasicMaterial
          color="#88ddff"
          transparent
          opacity={0.85}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* renderOrder=1: placed blobs render after Scatter blobs (renderOrder=0) */}
      <instancedMesh
        ref={blobRef}
        renderOrder={1}
        args={[BLOB_GEO, BLOB_MAT, MAX_PLACED]}
        visible={showBlobs && placed.length > 0}
      />

      {groupedPlaced.map(group => (
        <Suspense key={group.path} fallback={null}>
          <InstancedPlacedAsset
            path={group.path}
            instances={group.list}
            castShadow={castShadow}
          />
        </Suspense>
      ))}
    </>
  )
}
