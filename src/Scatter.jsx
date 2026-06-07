import { useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const BASE = '/models/kaykit/'
const FIELD = 27

const MODELS = [
  'BirchTree_1','BirchTree_2','BirchTree_3',
  'MapleTree_1','MapleTree_2',
  'DeadTree_1','DeadTree_2',
  'Bush','Bush_Large','Bush_Flowers',
  'Grass_Large','Grass_Small',
  'Flower_1_Clump','Flower_2_Clump',
]
MODELS.forEach(m => useGLTF.preload(`${BASE}${m}.gltf`))

// ── shared wind uniforms ──────────────────────────────────────────────────────

const grassWindUniforms = {
  uTime:         { value: 0 },
  uWindSpeed:    { value: 1.4 },
  uWindStrength: { value: 1.0 },
}

function applyGrassWind(material) {
  if (material._windApplied) return
  material._windApplied = true
  material.onBeforeCompile = (shader) => {
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
      vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      float wave = sin(uTime * uWindSpeed       + wPos.x * 1.9 + wPos.z * 1.3) * 0.20;
      float gust = sin(uTime * uWindSpeed * 0.2 + wPos.x * 0.5               ) * 0.12;
      transformed.x += (wave + gust) * windHeight * uWindStrength;
      transformed.z += wave * 0.4   * windHeight * uWindStrength;
      `
    )
  }
  material.needsUpdate = true
}

function applyWindToGrassScene(scene) {
  scene.traverse(child => {
    if (!child.isMesh) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach(mat => { if (mat.name === 'Grass') applyGrassWind(mat) })
  })
}

// ── blob shadow resources (shared across all shadow discs) ────────────────────

function makeBlobTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 62)
  grad.addColorStop(0,   'rgba(0,0,0,0.55)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.25)')
  grad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

// Shadow radius multipliers per type (cover = grass clumps, smaller discs)
const SHADOW_SCALE = { tree: 2.4, dead: 1.6, bush: 1.1, cover: 0.65 }

// ── scatter helper ────────────────────────────────────────────────────────────

function scatter(count, minDist, existing = []) {
  const pts = []
  let tries = 0
  const all = [...existing, ...pts]
  while (pts.length < count && tries++ < count * 40) {
    const x = (Math.random() - 0.5) * FIELD
    const z = (Math.random() - 0.5) * FIELD
    const ok = all.every(p => Math.hypot(p.x - x, p.z - z) > minDist)
    if (ok) { const pt = { x, z, ry: Math.random() * Math.PI * 2 }; pts.push(pt); all.push(pt) }
  }
  return pts
}

// ── component ─────────────────────────────────────────────────────────────────

export function Scatter({ windSpeed = 1.4, windStrength = 1.0, showBlobs = true, usePCSS = false }) {
  const b1 = useGLTF(`${BASE}BirchTree_1.gltf`).scene
  const b2 = useGLTF(`${BASE}BirchTree_2.gltf`).scene
  const b3 = useGLTF(`${BASE}BirchTree_3.gltf`).scene
  const m1 = useGLTF(`${BASE}MapleTree_1.gltf`).scene
  const m2 = useGLTF(`${BASE}MapleTree_2.gltf`).scene
  const d1 = useGLTF(`${BASE}DeadTree_1.gltf`).scene
  const d2 = useGLTF(`${BASE}DeadTree_2.gltf`).scene
  const bs  = useGLTF(`${BASE}Bush.gltf`).scene
  const bsl = useGLTF(`${BASE}Bush_Large.gltf`).scene
  const bsf = useGLTF(`${BASE}Bush_Flowers.gltf`).scene
  const gl  = useGLTF(`${BASE}Grass_Large.gltf`).scene
  const gs  = useGLTF(`${BASE}Grass_Small.gltf`).scene
  const fl  = useGLTF(`${BASE}Flower_1_Clump.gltf`).scene
  const f2  = useGLTF(`${BASE}Flower_2_Clump.gltf`).scene

  useMemo(() => {
    applyWindToGrassScene(gl)
    applyWindToGrassScene(gs)
  }, [gl, gs])

  // Blob shadow resources — created once, shared across all shadow discs
  const shadowTex = useMemo(() => makeBlobTexture(), [])
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(1, 16), [])
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    color: 0x000000,
  }), [shadowTex])

  const treeVariants = [b1, b2, b3, m1, m2]
  const deadVariants = [d1, d2]
  const bushVariants = [bs, bsl, bsf]
  const coverVariants = [gl, gs, fl, f2]

  const instances = useMemo(() => {
    const treePts  = scatter(16, 2.8)
    const deadPts  = scatter(6,  2.5, treePts)
    const bushPts  = scatter(30, 1.2, [...treePts, ...deadPts])
    const coverPts = scatter(50, 0.6)

    return [
      ...treePts.map((p, i)  => ({ ...p, type: 'tree', src: treeVariants[i  % treeVariants.length],  s: 0.38 + Math.random() * 0.18 })),
      ...deadPts.map((p, i)  => ({ ...p, type: 'dead', src: deadVariants[i  % deadVariants.length],  s: 0.32 + Math.random() * 0.15 })),
      ...bushPts.map((p, i)  => ({ ...p, type: 'bush', src: bushVariants[i  % bushVariants.length],  s: 0.55 + Math.random() * 0.25 })),
      ...coverPts.map((p, i) => ({ ...p, type: 'cover', src: coverVariants[i % coverVariants.length], s: 0.9 + Math.random() * 0.5  })),
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clones = useMemo(() =>
    instances.map((inst, i) => {
      const obj = inst.src.clone(true)
      obj.position.set(inst.x, 0, inst.z)
      obj.rotation.y = inst.ry
      obj.scale.setScalar(inst.s)
      return { obj, key: i }
    })
  , [instances])

  // Enable / disable real shadow casting on all clones when PCSS mode changes
  useEffect(() => {
    clones.forEach(({ obj }) => {
      obj.traverse(child => {
        if (!child.isMesh) return
        child.castShadow = usePCSS
        child.receiveShadow = usePCSS
      })
    })
  }, [clones, usePCSS])

  useFrame(({ clock }) => {
    grassWindUniforms.uTime.value         = clock.getElapsedTime()
    grassWindUniforms.uWindSpeed.value    = windSpeed
    grassWindUniforms.uWindStrength.value = windStrength
  })

  return (
    <>
      {/* Blob shadows — all types, hidden when PCSS/SSAO modes handle shadows */}
      {instances.map((inst, i) => (
        <mesh
          key={`shadow-${i}`}
          geometry={shadowGeo}
          material={shadowMat}
          position={[inst.x, 0.02, inst.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={inst.s * SHADOW_SCALE[inst.type]}
          visible={showBlobs}
        />
      ))}
      {clones.map(({ obj, key }) => (
        <primitive key={key} object={obj} />
      ))}
    </>
  )
}
