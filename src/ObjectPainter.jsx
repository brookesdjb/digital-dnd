import { Suspense, useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls, button } from 'leva'
import * as THREE from 'three'
import { applyWindToGrassScene } from './Scatter'

// ── asset catalog ─────────────────────────────────────────────────────────────

export const OBJECT_CATALOG = [
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
    shadowType:   'cover',
  })),
]

export const OBJECT_LABELS = OBJECT_CATALOG.map(o => o.label)

// Radius multipliers for blob shadow discs, matching Scatter's SHADOW_SCALE.
const SHADOW_SCALE = { tree: 2.4, dead: 1.6, bush: 1.1, cover: 0.65 }

// ── shared blob shadow resources ──────────────────────────────────────────────

function makeBlobTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx  = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 62)
  grad.addColorStop(0,   'rgba(0,0,0,0.55)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.25)')
  grad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

const BLOB_TEX = makeBlobTexture()
const BLOB_GEO = new THREE.CircleGeometry(1, 16)
// Stencil prevents overlapping shadow discs from accumulating darkness:
// the first disc to touch a pixel marks it (ref=1); all subsequent discs
// on the same pixel fail the NotEqual test and are skipped. Three.js
// clears the stencil buffer each frame automatically.
const BLOB_MAT = new THREE.MeshBasicMaterial({
  map: BLOB_TEX, transparent: true, depthWrite: false, color: 0x000000,
  stencilWrite: true,
  stencilRef:   1,
  stencilFunc:  THREE.NotEqualStencilFunc,
  stencilFail:  THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
})

// ── placed object renderers ───────────────────────────────────────────────────

function RockObject({ path, position, rotation, scale, castShadow }) {
  const { scene } = useGLTF(path)
  const [baseColor, normalMap, roughnessMap] = useTexture([
    '/textures/rocks/basecolor.png',
    '/textures/rocks/normal.png',
    '/textures/rocks/roughness.png',
  ])

  const clone = useMemo(() => {
    const c   = scene.clone(true)
    const mat = new THREE.MeshStandardMaterial({ map: baseColor, normalMap, roughnessMap })
    c.traverse(child => { if (child.isMesh) child.material = mat })
    return c
  }, [scene, baseColor, normalMap, roughnessMap])

  useEffect(() => {
    clone.traverse(child => {
      if (!child.isMesh) return
      child.castShadow    = castShadow
      child.receiveShadow = castShadow
    })
  }, [clone, castShadow])

  return (
    <primitive
      object={clone}
      position={[position.x, position.y, position.z]}
      rotation-y={rotation}
      scale={scale}
    />
  )
}

// FBX-exported foliage GLBs have no material definitions — Three.js defaults to
// roughness=1.0. We replace any untextured mesh with a matching material so
// placed objects look consistent with KayKit (roughness=0.5). Wind is applied
// to any 'Grass'-named material so placed grass sways in sync with Scatter.
const FOLIAGE_MAT = new THREE.MeshStandardMaterial({ color: 0x6fa33c, roughness: 0.5 })

function FoliageObject({ path, position, rotation, scale, castShadow }) {
  const { scene } = useGLTF(path)

  const clone = useMemo(() => {
    const c = scene.clone(true)
    c.traverse(child => {
      if (child.isMesh && !child.material?.map) child.material = FOLIAGE_MAT
    })
    applyWindToGrassScene(c)
    return c
  }, [scene])

  useEffect(() => {
    clone.traverse(child => {
      if (!child.isMesh) return
      child.castShadow    = castShadow
      child.receiveShadow = castShadow
    })
  }, [clone, castShadow])

  return (
    <primitive
      object={clone}
      position={[position.x, position.y, position.z]}
      rotation-y={rotation}
      scale={scale}
    />
  )
}

function PlacedObject(props) {
  return props.path.includes('/rocks/')
    ? <RockObject {...props} />
    : <FoliageObject {...props} />
}

// ── main component ────────────────────────────────────────────────────────────

export function ObjectPainter({
  objectPaintMode,
  ioRef,
  castShadow  = false,
  showBlobs   = true,
  blobSize    = 1.0,
  blobOpacity = 1.0,
}) {
  // Ref mirrors state so leva button callbacks always see the latest array.
  const placedRef = useRef([])
  const [placed, setPlaced] = useState([])

  // Keep the shared blob material opacity in sync with the parent's setting.
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

  // ── expose save / load to parent via ioRef ────────────────────────────────
  useEffect(() => {
    if (!ioRef) return
    ioRef.current = {
      save: () => placedRef.current.map(o => ({
        path:       o.path,
        x:          o.position.x,
        y:          o.position.y,
        z:          o.position.z,
        ry:         o.rotation,
        scale:      o.scale,
        shadowType: o.shadowType,
      })),
      load: (objects) => {
        const loaded = objects.map((o, i) => ({
          id:         Date.now() + i,
          path:       o.path,
          position:   new THREE.Vector3(o.x, o.y, o.z),
          rotation:   o.ry,
          scale:      o.scale,
          shadowType: o.shadowType ?? OBJECT_CATALOG.find(e => e.path === o.path)?.shadowType ?? 'cover',
        }))
        placedRef.current = loaded
        setPlaced(loaded)
      },
    }
  }, [ioRef])

  // Function form returns [data, set] so we can update objectScale on selection change.
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

  // Snap the scale slider to each object's catalogued default on selection change.
  useEffect(() => {
    const entry = OBJECT_CATALOG.find(o => o.label === selectedObject)
    if (entry) setControls({ objectScale: entry.defaultScale })
  }, [selectedObject]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preload the selected model so first placement doesn't stall.
  useEffect(() => {
    const entry = OBJECT_CATALOG.find(o => o.label === selectedObject)
    if (entry) useGLTF.preload(entry.path)
  }, [selectedObject])

  // ── painting state ────────────────────────────────────────────────────────
  const isPainting   = useRef(false)
  const lastPaintPos = useRef(null)

  useEffect(() => {
    const stop = () => { isPainting.current = false; lastPaintPos.current = null }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  // Uses sqrt(rand) for uniform area distribution (avoids clustering at centre).
  const scatter = useCallback((cx, cz, entry, bSize, dens, rRotation, oScale) => {
    const items = Array.from({ length: dens }, () => {
      const angle = Math.random() * Math.PI * 2
      const r     = Math.sqrt(Math.random()) * bSize
      return {
        id:         Date.now() + Math.random(),
        path:       entry.path,
        shadowType: entry.shadowType,
        position:   new THREE.Vector3(cx + Math.cos(angle) * r, 0, cz + Math.sin(angle) * r),
        rotation:   rRotation ? Math.random() * Math.PI * 2 : 0,
        scale:      oScale,
      }
    })
    const next = [...placedRef.current, ...items]
    placedRef.current = next
    setPlaced(next)
  }, [])

  // ── cursor ────────────────────────────────────────────────────────────────
  const cursorRef = useRef()
  const cursorPos = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!cursorRef.current) return
    cursorRef.current.visible = objectPaintMode
    if (objectPaintMode) {
      cursorRef.current.position.set(cursorPos.current.x, 0.05, cursorPos.current.z)
      cursorRef.current.scale.set(brushSize, brushSize, 1)
    }
  })

  // ── pointer handlers ──────────────────────────────────────────────────────
  const handlePointerDown = useCallback(e => {
    if (!objectPaintMode) return
    e.stopPropagation()
    isPainting.current = true
    const entry = OBJECT_CATALOG.find(o => o.label === selectedObject)
    if (!entry) return
    lastPaintPos.current = { x: e.point.x, z: e.point.z }
    scatter(e.point.x, e.point.z, entry, brushSize, density, randomRotation, objectScale)
  }, [objectPaintMode, selectedObject, brushSize, density, randomRotation, objectScale, scatter])

  const handlePointerMove = useCallback(e => {
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
    scatter(e.point.x, e.point.z, entry, brushSize, density, randomRotation, objectScale)
  }, [objectPaintMode, selectedObject, brushSize, density, randomRotation, objectScale, scatter])

  return (
    <>
      {/* Hit mesh — sits above Ground's hit plane (y=0.01) to win the raycast */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Cursor ring — scaled to brush radius */}
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

      {/* Blob shadows — only when Blob mode is active, matching Scatter's discs */}
      {showBlobs && placed.map(item => (
        <mesh
          key={`blob-${item.id}`}
          geometry={BLOB_GEO}
          material={BLOB_MAT}
          position={[item.position.x, 0.02, item.position.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={item.scale * (SHADOW_SCALE[item.shadowType] ?? 1.0) * blobSize}
        />
      ))}

      {/* Placed objects — each in its own Suspense so loading one doesn't stall others */}
      {placed.map(item => (
        <Suspense key={item.id} fallback={null}>
          <PlacedObject
            path={item.path}
            position={item.position}
            rotation={item.rotation}
            scale={item.scale}
            castShadow={castShadow}
          />
        </Suspense>
      ))}
    </>
  )
}
