'use client'

import { Suspense, useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useControls, button } from 'leva'
import * as THREE from 'three'
import type { GLTF } from 'three-stdlib'
import { applyWindToGrassScene, InstancedModel } from './Scatter'
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

const SHADOW_SCALE: Record<ShadowType, number> = { tree: 2.4, dead: 1.6, bush: 1.1, cover: 0.65 }

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
const MAX_PLACED = 2000

const BLOB_TEX = makeBlobTexture()
const BLOB_GEO = new THREE.CircleGeometry(1, 16)
const BLOB_MAT = new THREE.MeshBasicMaterial({
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
  const [baseColor, normalMap, roughnessMap] = useTexture([
    '/textures/rocks/basecolor.png',
    '/textures/rocks/normal.png',
    '/textures/rocks/roughness.png',
  ])

  const modifiedScene = useMemo(() => {
    const c   = scene.clone(true)
    const mat = new THREE.MeshStandardMaterial({ map: baseColor, normalMap, roughnessMap })
    c.traverse(child => { if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = mat })
    return c
  }, [scene, baseColor, normalMap, roughnessMap])

  return (
    <InstancedModel
      scene={modifiedScene}
      instances={instances}
      castShadow={castShadow}
      receiveShadow={castShadow}
    />
  )
}

const FOLIAGE_MAT = new THREE.MeshStandardMaterial({ color: 0x6fa33c, roughness: 0.5 })

function InstancedFoliageAsset({ path, instances, castShadow }: InstancedAssetProps) {
  const { scene } = useGLTF(path) as GLTF

  const modifiedScene = useMemo(() => {
    const c = scene.clone(true)
    c.traverse(child => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && !(mesh.material as THREE.MeshStandardMaterial)?.map) {
        mesh.material = FOLIAGE_MAT
      }
    })
    applyWindToGrassScene(c)
    return c
  }, [scene])

  return (
    <InstancedModel
      scene={modifiedScene}
      instances={instances}
      castShadow={castShadow}
      receiveShadow={castShadow}
    />
  )
}

function InstancedPlacedAsset(props: InstancedAssetProps) {
  return props.path.includes('/rocks/')
    ? <InstancedRockAsset {...props} />
    : <InstancedFoliageAsset {...props} />
}

// ── ioRef type ────────────────────────────────────────────────────────────────

export interface ObjectsIO {
  save: () => PlacedObject[]
  load: (objects: PlacedObject[]) => void
}

// ── main component ────────────────────────────────────────────────────────────

interface ObjectPainterProps {
  objectPaintMode: boolean
  ioRef?: React.MutableRefObject<ObjectsIO | undefined>
  castShadow?: boolean
  showBlobs?: boolean
  blobSize?: number
  blobOpacity?: number
}

export function ObjectPainter({
  objectPaintMode,
  ioRef,
  castShadow  = false,
  showBlobs   = true,
  blobSize    = 1.0,
  blobOpacity = 1.0,
}: ObjectPainterProps) {
  const placedRef = useRef<PlacedObject[]>([])
  const [placed, setPlaced] = useState<PlacedObject[]>([])

  useEffect(() => { BLOB_MAT.opacity = blobOpacity }, [blobOpacity])

  const undo = useCallback(() => {
    const next = placedRef.current.slice(0, -1)
    placedRef.current = next
    setPlaced(next)
  }, [])

  const clearAll = useCallback(() => {
    placedRef.current = []
    setPlaced([])
  }, [])

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
    }
  }, [ioRef])

  const [{ selectedObject, randomRotation, objectScale, brushSize, density }, setControls] =
    useControls('Object Painting', () => ({
      selectedObject: { value: OBJECT_LABELS[0], options: OBJECT_LABELS, label: 'Object' },
      randomRotation: { value: true,  label: 'Random Y Rotation' },
      objectScale:    { value: 0.5,  min: 0.05, max: 10,   step: 0.05, label: 'Scale'      },
      brushSize:      { value: 1.5,  min: 0.25, max: 15,   step: 0.25, label: 'Brush Size' },
      density:        { value: 1,    min: 1,    max: 20,   step: 1,    label: 'Density'    },
      'Undo Last':    button(() => undo()),
      'Clear All':    button(() => clearAll()),
    }))

  useEffect(() => {
    const entry = OBJECT_CATALOG.find(o => o.label === selectedObject)
    if (entry) setControls({ objectScale: entry.defaultScale })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObject])

  useEffect(() => {
    const entry = OBJECT_CATALOG.find(o => o.label === selectedObject)
    if (entry) useGLTF.preload(entry.path)
  }, [selectedObject])

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
  ) => {
    const items: PlacedObject[] = Array.from({ length: dens }, () => {
      const angle = Math.random() * Math.PI * 2
      const r     = Math.sqrt(Math.random()) * bSize
      return {
        id:         String(Date.now() + Math.random()),
        path:       entry.path,
        shadowType: entry.shadowType,
        x:          cx + Math.cos(angle) * r,
        y:          0,
        z:          cz + Math.sin(angle) * r,
        ry:         rRotation ? Math.random() * Math.PI * 2 : 0,
        scale:      oScale,
      }
    })
    const next = [...placedRef.current, ...items]
    placedRef.current = next
    setPlaced(next)
  }, [])

  const cursorRef = useRef<THREE.Mesh>(null)
  const cursorPos = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!cursorRef.current) return
    cursorRef.current.visible = objectPaintMode
    if (objectPaintMode) {
      cursorRef.current.position.set(cursorPos.current.x, 0.05, cursorPos.current.z)
      cursorRef.current.scale.set(brushSize, brushSize, 1)
    }
  })

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!objectPaintMode) return
    e.stopPropagation()
    isPainting.current = true
    const entry = OBJECT_CATALOG.find(o => o.label === selectedObject)
    if (!entry) return
    lastPaintPos.current = { x: e.point.x, z: e.point.z }
    scatterObjects(e.point.x, e.point.z, entry, brushSize, density, randomRotation, objectScale)
  }, [objectPaintMode, selectedObject, brushSize, density, randomRotation, objectScale, scatterObjects])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!objectPaintMode) return
    e.stopPropagation()
    cursorPos.current.set(e.point.x, 0, e.point.z)
    if (!isPainting.current) return
    const last = lastPaintPos.current
    if (!last) return
    const dx = e.point.x - last.x
    const dz = e.point.z - last.z
    if (Math.sqrt(dx * dx + dz * dz) < brushSize * 0.4) return
    const entry = OBJECT_CATALOG.find(o => o.label === selectedObject)
    if (!entry) return
    lastPaintPos.current = { x: e.point.x, z: e.point.z }
    scatterObjects(e.point.x, e.point.z, entry, brushSize, density, randomRotation, objectScale)
  }, [objectPaintMode, selectedObject, brushSize, density, randomRotation, objectScale, scatterObjects])

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
