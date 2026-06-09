'use client'

import { useMemo, useEffect, useRef, useCallback } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { GLTF } from 'three-stdlib'
import { applyWindByType, tickWind, type WindType } from './wind'

// Re-export for callers that imported grassWindUniforms from Scatter directly.
export { windUniforms as grassWindUniforms } from './wind'

const BASE = '/models/kaykit/'

const MODELS = [
  'BirchTree_1',
  'MapleTree_1',
  'DeadTree_1',
  'Bush','Bush_Flowers',
  'Grass_Large',
  'Flower_1_Clump',
]
MODELS.forEach(m => useGLTF.preload(`${BASE}${m}.gltf`))

// ── vegetation material downgrade ────────────────────────────────────────────
// MeshLambertMaterial compiles ~4× faster than MeshStandardMaterial on macOS Metal.
// For a top-down view, the PBR→Phong quality difference is imperceptible on foliage.

function toVegMaterial(src: THREE.Material, windType?: WindType): THREE.Material {
  if (!(src instanceof THREE.MeshStandardMaterial)) return src
  const lamb = new THREE.MeshLambertMaterial({
    name:        src.name,
    map:         src.map,
    emissive:    src.emissive?.clone?.() ?? new THREE.Color(0, 0, 0),
    emissiveMap: src.emissiveMap,
    transparent: src.transparent,
    alphaTest:   src.alphaTest,
    opacity:     src.opacity,
    side:        src.side,
    depthWrite:  src.depthWrite,
    blending:    src.blending,
    color:       src.color?.clone?.() ?? new THREE.Color(1, 1, 1),
  })
  if (windType) applyWindByType(lamb as unknown as THREE.Material, windType)
  return lamb
}

// ── InstancedModel ────────────────────────────────────────────────────────────

// Fixed buffer size — instancedMesh args must never change at runtime.
// mesh.count controls how many instances are actually rendered each frame.
const MAX_INSTANCES = 1000

interface InstanceData {
  position?: THREE.Vector3
  x?: number
  y?: number
  z?: number
  rotation?: number
  ry?: number
  scale?: number | number[] | { x: number; y: number; z: number }
  s?: number | number[] | { x: number; y: number; z: number }
}

interface MeshData {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  localMatrix: THREE.Matrix4
}

interface InstancedModelProps {
  scene: THREE.Object3D
  instances: InstanceData[]
  castShadow?: boolean
  receiveShadow?: boolean
  windType?: WindType
}

export function InstancedModel({ scene, instances, castShadow, receiveShadow, windType }: InstancedModelProps) {
  const meshes = useMemo<MeshData[]>(() => {
    const s = scene.clone(true)
    s.position.set(0, 0, 0)
    s.rotation.set(0, 0, 0)
    s.scale.set(1, 1, 1)
    s.updateMatrixWorld(true)

    const list: MeshData[] = []
    s.traverse(child => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        // Downgrade PBR to Lambert for all vegetation — faster shader compilation.
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mesh.material = mats.length === 1
          ? toVegMaterial(mats[0], windType)
          : mats.map(m => toVegMaterial(m, windType))
        list.push({
          geometry: mesh.geometry,
          material: mesh.material,
          localMatrix: mesh.matrixWorld.clone(),
        })
      }
    })
    return list
  }, [scene, windType])

  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([])

  useEffect(() => {
    const dummy = new THREE.Object3D()
    const tempMatrix = new THREE.Matrix4()

    meshes.forEach((meshData, meshIdx) => {
      const instMesh = meshRefs.current[meshIdx]
      if (!instMesh) return

      instances.forEach((inst, instIdx) => {
        if (inst.position) {
          dummy.position.copy(inst.position)
        } else {
          dummy.position.set(inst.x ?? 0, inst.y ?? 0, inst.z ?? 0)
        }

        dummy.rotation.set(0, inst.ry ?? inst.rotation ?? 0, 0)

        const s = inst.s ?? inst.scale ?? 1
        if (typeof s === 'number') {
          dummy.scale.setScalar(s)
        } else if (Array.isArray(s)) {
          dummy.scale.set(s[0], s[1], s[2])
        } else {
          dummy.scale.set(s.x, s.y, s.z)
        }
        dummy.updateMatrix()

        tempMatrix.multiplyMatrices(dummy.matrix, meshData.localMatrix)
        instMesh.setMatrixAt(instIdx, tempMatrix)
      })

      instMesh.instanceMatrix.needsUpdate = true
      instMesh.count = instances.length
    })
  }, [meshes, instances])

  return (
    <>
      {meshes.map((meshData, idx) => (
        <instancedMesh
          key={idx}
          ref={el => { meshRefs.current[idx] = el }}
          args={[meshData.geometry, meshData.material as THREE.Material, MAX_INSTANCES]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </>
  )
}

// ── blob shadow resources ─────────────────────────────────────────────────────

function makeBlobTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 62)
  grad.addColorStop(0,   'rgba(0,0,0,0.55)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.25)')
  grad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

const SHADOW_SCALE: Record<string, number> = { tree: 2.4, dead: 1.6, bush: 1.1, cover: 0.65 }

// ── scatter helpers ───────────────────────────────────────────────────────────

// Mulberry32 seeded PRNG — deterministic so control and display get identical vegetation.
function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

interface ScatterPoint {
  x: number
  z: number
  ry: number
}

function scatter(count: number, minDist: number, existing: ScatterPoint[], field: number, rng: () => number): ScatterPoint[] {
  const pts: ScatterPoint[] = []
  let tries = 0
  const all = [...existing]
  while (pts.length < count && tries++ < count * 40) {
    const x = (rng() - 0.5) * field
    const z = (rng() - 0.5) * field
    const ok = all.every(p => Math.hypot(p.x - x, p.z - z) > minDist)
    if (ok) { const pt = { x, z, ry: rng() * Math.PI * 2 }; pts.push(pt); all.push(pt) }
  }
  return pts
}

// ── Scatter component ─────────────────────────────────────────────────────────

const DEFAULT_SEED = 0x5CA77E8D
const MAX_SCATTER_SHADOWS = 2000

interface ScatterProps {
  windSpeed?: number
  windStrength?: number
  showBlobs?: boolean
  usePCSS?: boolean
  blobSize?: number
  blobOpacity?: number
  fieldSize?: number
  seed?: number
  enabled?: boolean
  densityScale?: number
  erasedIndices?: number[]
  eraseMode?: boolean
  eraseBrushSize?: number
  onEraseIndices?: (idxs: number[]) => void
}

export function Scatter({
  windSpeed    = 1.4,
  windStrength = 1.0,
  showBlobs    = true,
  usePCSS      = false,
  blobSize     = 1.0,
  blobOpacity  = 1.0,
  fieldSize    = 27,
  seed         = DEFAULT_SEED,
  enabled      = true,
  densityScale    = 1.0,
  erasedIndices   = [],
  eraseMode       = false,
  eraseBrushSize  = 2,
  onEraseIndices,
}: ScatterProps) {
  const { scene: b1  } = useGLTF(`${BASE}BirchTree_1.gltf`)   as GLTF
  const { scene: m1  } = useGLTF(`${BASE}MapleTree_1.gltf`)   as GLTF
  const { scene: d1  } = useGLTF(`${BASE}DeadTree_1.gltf`)    as GLTF
  const { scene: bs  } = useGLTF(`${BASE}Bush.gltf`)           as GLTF
  const { scene: bsf } = useGLTF(`${BASE}Bush_Flowers.gltf`)  as GLTF
  const { scene: gl  } = useGLTF(`${BASE}Grass_Large.gltf`)   as GLTF
  const { scene: fl  } = useGLTF(`${BASE}Flower_1_Clump.gltf`) as GLTF

  const shadowTex = useMemo(() => makeBlobTexture(), [])
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(1, 16), [])
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false, color: 0x000000,
  }), [shadowTex])

  const treeVariants  = [b1, m1]
  const deadVariants  = [d1]
  const bushVariants  = [bs, bsf]
  const coverVariants = [gl, fl]

  type InstanceType = ScatterPoint & { type: string; src: THREE.Object3D; s: number }

  const instances = useMemo<InstanceType[]>(() => {
    const rng    = seededRng(seed)
    const scale  = Math.max(1, fieldSize / 27) * Math.max(0.05, densityScale)
    const nTree  = Math.round(16 * scale)
    const nDead  = Math.round(6  * scale)
    const nBush  = Math.round(30 * scale)
    const nCover = Math.round(50 * scale)

    const treePts  = scatter(nTree,  2.8, [],                        fieldSize, rng)
    const deadPts  = scatter(nDead,  2.5, treePts,                   fieldSize, rng)
    const bushPts  = scatter(nBush,  1.2, [...treePts, ...deadPts],  fieldSize, rng)
    const coverPts = scatter(nCover, 0.6, [],                        fieldSize, rng)

    return [
      ...treePts.map((p, i)  => ({ ...p, type: 'tree',  src: treeVariants[i  % treeVariants.length],  s: 0.38 + rng() * 0.18 })),
      ...deadPts.map((p, i)  => ({ ...p, type: 'dead',  src: deadVariants[i  % deadVariants.length],  s: 0.32 + rng() * 0.15 })),
      ...bushPts.map((p, i)  => ({ ...p, type: 'bush',  src: bushVariants[i  % bushVariants.length],  s: 0.55 + rng() * 0.25 })),
      ...coverPts.map((p, i) => ({ ...p, type: 'cover', src: coverVariants[i % coverVariants.length], s: 0.9  + rng() * 0.5  })),
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSize, seed, densityScale])

  const allModels = useMemo(() => [
    { key: 'b1',  scene: b1,  windType: 'tree'  as WindType },
    { key: 'm1',  scene: m1,  windType: 'tree'  as WindType },
    { key: 'd1',  scene: d1,  windType: 'dead'  as WindType },
    { key: 'bs',  scene: bs,  windType: 'bush'  as WindType },
    { key: 'bsf', scene: bsf, windType: 'bush'  as WindType },
    { key: 'gl',  scene: gl,  windType: 'grass' as WindType },
    { key: 'fl',  scene: fl,  windType: 'grass' as WindType },
  ], [b1, m1, d1, bs, bsf, gl, fl])

  const erasedSet = useMemo(() => new Set(erasedIndices), [erasedIndices])

  const visibleInstances = useMemo(
    () => erasedSet.size > 0 ? instances.filter((_, i) => !erasedSet.has(i)) : instances,
    [instances, erasedSet],
  )

  const groupedInstances = useMemo(() => {
    const groups = new Map<THREE.Object3D, { list: InstanceData[]; windType: WindType }>()
    allModels.forEach(m => groups.set(m.scene, { list: [], windType: m.windType }))
    visibleInstances.forEach(inst => {
      const g = groups.get(inst.src)
      if (g) g.list.push({ x: inst.x, z: inst.z, ry: inst.ry, s: inst.s })
    })
    return allModels
      .map(m => ({ key: m.key, scene: m.scene, windType: m.windType, list: groups.get(m.scene)?.list ?? [] }))
      .filter(g => g.list.length > 0)
  }, [visibleInstances, allModels])

  const shadowRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = shadowRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    visibleInstances.forEach((inst, i) => {
      dummy.position.set(inst.x, 0.02, inst.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      const scale = inst.s * SHADOW_SCALE[inst.type] * blobSize
      dummy.scale.set(scale, scale, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = visibleInstances.length
  }, [visibleInstances, blobSize])

  useEffect(() => { shadowMat.opacity = blobOpacity }, [shadowMat, blobOpacity])

  const isPainting   = useRef(false)
  const eraseCursorRef = useRef<THREE.Mesh>(null)
  const eraseCursorPos = useRef(new THREE.Vector3())

  useEffect(() => {
    const stop = () => { isPainting.current = false }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const collectErased = useCallback((px: number, pz: number) => {
    const r2 = eraseBrushSize * eraseBrushSize
    const hit = instances.reduce<number[]>((acc, inst, i) => {
      const dx = inst.x - px, dz = inst.z - pz
      if (dx * dx + dz * dz <= r2 && !erasedSet.has(i)) acc.push(i)
      return acc
    }, [])
    if (hit.length > 0) onEraseIndices?.(hit)
  }, [instances, erasedSet, eraseBrushSize, onEraseIndices])

  const handleEraseDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!eraseMode) return
    e.stopPropagation()
    isPainting.current = true
    collectErased(e.point.x, e.point.z)
  }, [eraseMode, collectErased])

  const handleEraseMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!eraseMode) return
    e.stopPropagation()
    eraseCursorPos.current.copy(e.point)
    if (isPainting.current) collectErased(e.point.x, e.point.z)
  }, [eraseMode, collectErased])

  useFrame(() => {
    if (!eraseCursorRef.current) return
    eraseCursorRef.current.visible = eraseMode && enabled
    if (eraseMode) {
      eraseCursorRef.current.position.set(eraseCursorPos.current.x, 0.05, eraseCursorPos.current.z)
      eraseCursorRef.current.scale.set(eraseBrushSize, eraseBrushSize, 1)
    }
  })

  useFrame(({ clock }) => {
    tickWind(clock.getElapsedTime(), windSpeed, windStrength)
  })

  if (!enabled) return null

  return (
    <>
      <instancedMesh
        ref={shadowRef}
        args={[shadowGeo, shadowMat, MAX_SCATTER_SHADOWS]}
        visible={showBlobs}
      />

      {/* Transparent hit mesh for erase mode */}
      {eraseMode && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03, 0]}
          onPointerDown={handleEraseDown}
          onPointerMove={handleEraseMove}
        >
          <planeGeometry args={[80, 80]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      <mesh ref={eraseCursorRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.88, 1, 64]} />
        <meshBasicMaterial
          color="#ff6633"
          transparent opacity={0.85}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {groupedInstances.map(group => (
        <InstancedModel
          key={group.key}
          scene={group.scene}
          instances={group.list}
          windType={group.windType}
          castShadow={usePCSS}
          receiveShadow={usePCSS}
        />
      ))}
    </>
  )
}
