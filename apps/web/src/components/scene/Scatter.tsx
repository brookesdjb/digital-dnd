'use client'

import { useMemo, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GLTF } from 'three-stdlib'

const BASE = '/models/kaykit/'

// Reduced to 8 models (variants cut: BirchTree_2/3, MapleTree_2, DeadTree_2,
// Bush_Large, Grass_Small, Flower_2_Clump) — visual diversity from random scale/rotation.
const MODELS = [
  'BirchTree_1',
  'MapleTree_1',
  'DeadTree_1',
  'Bush','Bush_Flowers',
  'Grass_Large',
  'Flower_1_Clump',
]
MODELS.forEach(m => useGLTF.preload(`${BASE}${m}.gltf`))

// ── shared wind uniforms ──────────────────────────────────────────────────────
// Exported so ObjectPainter can apply the same wind to manually placed grass.

export const grassWindUniforms = {
  uTime:         { value: 0 },
  uWindSpeed:    { value: 1.4 },
  uWindStrength: { value: 1.0 },
}

// Single stable function reference — required for Three.js customProgramCacheKey
// to deduplicate the wind program across all grass material instances.
function windOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uTime         = grassWindUniforms.uTime
  shader.uniforms.uWindSpeed    = grassWindUniforms.uWindSpeed
  shader.uniforms.uWindStrength = grassWindUniforms.uWindStrength
  shader.vertexShader =
    `uniform float uTime;\nuniform float uWindSpeed;\nuniform float uWindStrength;\n`
    + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    /* glsl */`
    #include <begin_vertex>
    float windHeight = 1.0 - uv.y;
    #ifdef USE_INSTANCING
      vec3 wPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
      vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif
    float wave = sin(uTime * uWindSpeed       + wPos.x * 1.9 + wPos.z * 1.3) * 0.20;
    float gust = sin(uTime * uWindSpeed * 0.2 + wPos.x * 0.5               ) * 0.12;
    transformed.x += (wave + gust) * windHeight * uWindStrength;
    transformed.z += wave * 0.4   * windHeight * uWindStrength;
    `
  )
}

export function applyGrassWind(material: THREE.Material) {
  const mat = material as THREE.Material & {
    _windApplied?: boolean
    onBeforeCompile: typeof windOnBeforeCompile
    customProgramCacheKey: () => string
    needsUpdate: boolean
  }
  if (mat._windApplied) return
  mat._windApplied = true
  mat.onBeforeCompile = windOnBeforeCompile
  // Stable cache key — all wind-modified materials share one compiled GPU program.
  mat.customProgramCacheKey = () => 'grass-wind-v1'
  mat.needsUpdate = true
}

export function applyWindToGrassScene(scene: THREE.Object3D) {
  scene.traverse(child => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mats.forEach(mat => { if (mat.name === 'Grass') applyGrassWind(mat) })
  })
}

// ── vegetation material downgrade ────────────────────────────────────────────
// MeshLambertMaterial compiles ~4× faster than MeshStandardMaterial on macOS Metal.
// For a top-down view, the PBR→Phong quality difference is imperceptible on foliage.

function toVegMaterial(src: THREE.Material): THREE.Material {
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
  if (src.name === 'Grass') applyGrassWind(lamb as unknown as THREE.Material)
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
}

export function InstancedModel({ scene, instances, castShadow, receiveShadow }: InstancedModelProps) {
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
        mesh.material = mats.length === 1 ? toVegMaterial(mats[0]) : mats.map(toVegMaterial)
        list.push({
          geometry: mesh.geometry,
          material: mesh.material,
          localMatrix: mesh.matrixWorld.clone(),
        })
      }
    })
    return list
  }, [scene])

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

interface ScatterProps {
  windSpeed?: number
  windStrength?: number
  showBlobs?: boolean
  usePCSS?: boolean
  blobSize?: number
  blobOpacity?: number
  fieldSize?: number
}

export function Scatter({
  windSpeed    = 1.4,
  windStrength = 1.0,
  showBlobs    = true,
  usePCSS      = false,
  blobSize     = 1.0,
  blobOpacity  = 1.0,
  fieldSize    = 27,
}: ScatterProps) {
  const { scene: b1  } = useGLTF(`${BASE}BirchTree_1.gltf`)   as GLTF
  const { scene: m1  } = useGLTF(`${BASE}MapleTree_1.gltf`)   as GLTF
  const { scene: d1  } = useGLTF(`${BASE}DeadTree_1.gltf`)    as GLTF
  const { scene: bs  } = useGLTF(`${BASE}Bush.gltf`)           as GLTF
  const { scene: bsf } = useGLTF(`${BASE}Bush_Flowers.gltf`)  as GLTF
  const { scene: gl  } = useGLTF(`${BASE}Grass_Large.gltf`)   as GLTF
  const { scene: fl  } = useGLTF(`${BASE}Flower_1_Clump.gltf`) as GLTF

  useMemo(() => {
    applyWindToGrassScene(gl)
  }, [gl])

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
    const rng    = seededRng(0x5CA77E8D)  // fixed seed — same result on control and display
    const scale  = Math.max(1, fieldSize / 27)
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
  }, [fieldSize])

  const allModels = useMemo(() => [
    { key: 'b1', scene: b1 },
    { key: 'm1', scene: m1 },
    { key: 'd1', scene: d1 },
    { key: 'bs', scene: bs }, { key: 'bsf', scene: bsf },
    { key: 'gl', scene: gl },
    { key: 'fl', scene: fl },
  ], [b1, m1, d1, bs, bsf, gl, fl])

  const groupedInstances = useMemo(() => {
    const groups = new Map<THREE.Object3D, InstanceData[]>()
    allModels.forEach(m => groups.set(m.scene, []))
    instances.forEach(inst => {
      const list = groups.get(inst.src)
      if (list) list.push({ x: inst.x, z: inst.z, ry: inst.ry, s: inst.s })
    })
    return allModels
      .map(m => ({ key: m.key, scene: m.scene, list: groups.get(m.scene) ?? [] }))
      .filter(g => g.list.length > 0)
  }, [instances, allModels])

  const shadowRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = shadowRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    instances.forEach((inst, i) => {
      dummy.position.set(inst.x, 0.02, inst.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      const scale = inst.s * SHADOW_SCALE[inst.type] * blobSize
      dummy.scale.set(scale, scale, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [instances, blobSize])

  useEffect(() => { shadowMat.opacity = blobOpacity }, [shadowMat, blobOpacity])

  useFrame(({ clock }) => {
    grassWindUniforms.uTime.value         = clock.getElapsedTime()
    grassWindUniforms.uWindSpeed.value    = windSpeed
    grassWindUniforms.uWindStrength.value = windStrength
  })

  return (
    <>
      <instancedMesh
        ref={shadowRef}
        args={[shadowGeo, shadowMat, instances.length]}
        visible={showBlobs}
      />
      {groupedInstances.map(group => (
        <InstancedModel
          key={group.key}
          scene={group.scene}
          instances={group.list}
          castShadow={usePCSS}
          receiveShadow={usePCSS}
        />
      ))}
    </>
  )
}
