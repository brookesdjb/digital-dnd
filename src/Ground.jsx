import { useRef, useMemo, useCallback, useEffect } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const GROUND_SIZE = 80
const MASK_SIZE   = 512
const ROAD_ROT    = [-Math.PI / 2, 0, 0]

// Paint or erase into the mask DataTexture at the given UV position
function applyBrush(uvX, uvY, radiusWorld, data, tex, erase) {
  const cx  = Math.floor(uvX * MASK_SIZE)
  const cy  = Math.floor((1 - uvY) * MASK_SIZE)   // flip Y to match Three UV convention
  const rPx = Math.max(2, Math.floor((radiusWorld / GROUND_SIZE) * MASK_SIZE))

  for (let dy = -rPx; dy <= rPx; dy++) {
    for (let dx = -rPx; dx <= rPx; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > rPx) continue
      const t       = 1 - d / rPx
      const falloff = t * t * (3 - 2 * t)   // smoothstep — soft brush edge
      const px = cx + dx
      const py = cy + dy
      if (px < 0 || px >= MASK_SIZE || py < 0 || py >= MASK_SIZE) continue
      const idx = py * MASK_SIZE + px
      if (erase) {
        data[idx] = Math.max(0,   data[idx] - Math.floor(falloff * 180))
      } else {
        data[idx] = Math.min(255, data[idx] + Math.floor(falloff * 180))
      }
    }
  }
  tex.needsUpdate = true
}

export function Ground({ receiveShadow, paintMode, brushRadius, eraseMode }) {
  // ── road mask ────────────────────────────────────────────────────────────────
  const maskData = useRef(new Uint8Array(MASK_SIZE * MASK_SIZE))
  const maskTex  = useMemo(() => {
    const t = new THREE.DataTexture(
      maskData.current, MASK_SIZE, MASK_SIZE,
      THREE.RedFormat, THREE.UnsignedByteType
    )
    t.minFilter   = THREE.LinearFilter
    t.magFilter   = THREE.LinearFilter
    t.needsUpdate = true
    return t
  }, [])

  // ── painting state ───────────────────────────────────────────────────────────
  const isPainting = useRef(false)
  const cursorRef  = useRef()
  const cursorPos  = useRef(new THREE.Vector3())

  useEffect(() => {
    const stop = () => { isPainting.current = false }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  // ── textures ─────────────────────────────────────────────────────────────────
  const [grassColor, grassRough, grassNormal] = useTexture([
    '/textures/moss_ground_03_2k/moss_groud_03_Base_Color_2k.png',
    '/textures/moss_ground_03_2k/moss_groud_03_Roughness_2k.png',
    '/textures/moss_ground_03_2k/moss_groud_03_Normal_gl_2k.png',
  ])
  const [roadColor, roadRough, roadNormal] = useTexture([
    '/textures/ground_stones_02_2k/ground_stones_02_basecolor_2k.png',
    '/textures/ground_stones_02_2k/ground_stones_02_roughness_2k.png',
    '/textures/ground_stones_02_2k/ground_stones_02_normal_gl_2k.png',
  ])

  useMemo(() => {
    ;[grassColor, grassRough, grassNormal].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(12, 12)
    })
    ;[roadColor, roadRough, roadNormal].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(10, 10)
    })
  }, [grassColor, grassRough, grassNormal, roadColor, roadRough, roadNormal])

  // ── pointer handlers ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    if (!paintMode) return
    e.stopPropagation()
    isPainting.current = true
    if (e.uv) applyBrush(e.uv.x, e.uv.y, brushRadius, maskData.current, maskTex, eraseMode)
  }, [paintMode, brushRadius, eraseMode, maskTex])

  const handlePointerMove = useCallback((e) => {
    if (!paintMode) return
    e.stopPropagation()
    cursorPos.current.copy(e.point)
    if (isPainting.current && e.uv) {
      applyBrush(e.uv.x, e.uv.y, brushRadius, maskData.current, maskTex, eraseMode)
    }
  }, [paintMode, brushRadius, eraseMode, maskTex])

  // ── cursor ring via useFrame (no state update on every move) ─────────────────
  useFrame(() => {
    if (!cursorRef.current) return
    cursorRef.current.visible = paintMode
    if (paintMode) {
      cursorRef.current.position.set(cursorPos.current.x, 0.03, cursorPos.current.z)
      // scale a unit ring to match current brush size
      cursorRef.current.scale.set(brushRadius, brushRadius, 1)
    }
  })

  return (
    <>
      {/* ── grass base ──────────────────────────────────────────────────────── */}
      <mesh
        rotation={ROAD_ROT}
        position={[0, -0.02, 0]}
        receiveShadow={receiveShadow}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          map={grassColor}
          roughnessMap={grassRough}
          normalMap={grassNormal}
          roughness={1}
        />
      </mesh>

      {/* ── road overlay (alphaMap = painted mask) ───────────────────────────── */}
      <mesh
        rotation={ROAD_ROT}
        position={[0, -0.015, 0]}
        receiveShadow={false}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          map={roadColor}
          roughnessMap={roadRough}
          normalMap={roadNormal}
          alphaMap={maskTex}
          transparent
          depthWrite={false}
          roughness={0.9}
        />
      </mesh>

      {/* ── brush cursor ring ────────────────────────────────────────────────── */}
      {/* Unit ring (inner=0.88, outer=1) scaled to brushRadius in world space */}
      <mesh ref={cursorRef} rotation={ROAD_ROT} visible={false}>
        <ringGeometry args={[0.88, 1, 64]} />
        <meshBasicMaterial
          color={eraseMode ? '#ff5555' : '#ffe066'}
          transparent
          opacity={0.85}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  )
}
