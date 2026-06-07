import { useRef, useMemo, useCallback, useEffect } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls, button } from 'leva'
import * as THREE from 'three'

const GROUND_SIZE = 80
const MASK_SIZE   = 512
const ROAD_ROT    = [-Math.PI / 2, 0, 0]
const ROAD_REPEAT = 20

export const ROAD_TEXTURES = [
  { label: 'Ground Stones 02',
    color:  '/textures/ground_stones_02_2k/ground_stones_02_basecolor_2k.png',
    rough:  '/textures/ground_stones_02_2k/ground_stones_02_roughness_2k.png',
    normal: '/textures/ground_stones_02_2k/ground_stones_02_normal_gl_2k.png' },
  { label: 'Ground Stones 01',
    color:  '/textures/ground_stones_01_2k/ground_stones_01_baseColor_2k.png',
    rough:  '/textures/ground_stones_01_2k/ground_stones_01_roughness_2k.png',
    normal: '/textures/ground_stones_01_2k/ground_stones_01_normal_gl_2k.png' },
  { label: 'Ground 02',
    color:  '/textures/ground_02_2k/ground_02_color_2k.png',
    rough:  '/textures/ground_02_2k/ground_02_roughness_2k.png',
    normal: '/textures/ground_02_2k/ground_02_normal_gl_2k.png' },
  { label: 'Ground 03',
    color:  '/textures/ground_03_2k/ground_03_color_2k.png',
    rough:  '/textures/ground_03_2k/ground_03_roughness_2k.png',
    normal: '/textures/ground_03_2k/ground_03_normal_gl_2k.png' },
  { label: 'Ground 06',
    color:  '/textures/ground_06_2k/ground_06_baseColor_2k.png',
    rough:  '/textures/ground_06_2k/ground_06_roughness_2k.png',
    normal: '/textures/ground_06_2k/ground_06_normal_gl_2k.png' },
  { label: 'Ground Tiles 04',
    color:  '/textures/ground_tiles_04_2k/ground_tiles_04_color_2k.png',
    rough:  '/textures/ground_tiles_04_2k/ground_tiles_04_roughness_2k.png',
    normal: '/textures/ground_tiles_04_2k/ground_tiles_04_normal_gl_2k.png' },
  { label: 'Ground Tiles 12',
    color:  '/textures/ground_tiles_12_2k/ground_tiles_12_baseColor_2k.png',
    rough:  '/textures/ground_tiles_12_2k/ground_tiles_12_roughness_2k.png',
    normal: '/textures/ground_tiles_12_2k/ground_tiles_12_normal_gl_2k.png' },
  { label: 'Ground Tiles 22',
    color:  '/textures/ground_tiles_22_2k/ground_tiles_22_baseColor_2k.png',
    rough:  '/textures/ground_tiles_22_2k/ground_tiles_22_roughness_2k.png',
    normal: '/textures/ground_tiles_22_2k/ground_tiles_22_normal_gl_2k.png' },
  { label: 'Desert Ground',
    color:  '/textures/desert_ground_01_2k/desert_ground_01_baseColor_2k.png',
    rough:  '/textures/desert_ground_01_2k/desert_ground_01_roughness_2k.png',
    normal: '/textures/desert_ground_01_2k/desert_ground_01_normal_gl_2k.png' },
  { label: 'Moss Ground',
    color:  '/textures/moss_ground_02_2k/moss_groud_02_Base_Color_2k.png',
    rough:  '/textures/moss_ground_02_2k/moss_groud_02_Roughness_2k.png',
    normal: '/textures/moss_ground_02_2k/moss_groud_02_Normal_gl_2k.png' },
  { label: 'Rocks & Water',
    color:  '/textures/rocks_with_water_01_2k/rocks_with_water_01_color_2k.png',
    rough:  '/textures/rocks_with_water_01_2k/rocks_with_water_01_roughness_2k.png',
    normal: '/textures/rocks_with_water_01_2k/rocks_with_water_01_normal_gl_2k.png' },
  { label: 'Wood Planks',
    color:  '/textures/wood_planks_with_sand_01_2k/wood_planks_with_sand_01_color_2k.png',
    rough:  '/textures/wood_planks_with_sand_01_2k/wood_planks_with_sand_01_roughness_2k.png',
    normal: '/textures/wood_planks_with_sand_01_2k/wood_planks_with_sand_01_normal_gl_2k.png' },
]

export const ROAD_TEXTURE_LABELS = ROAD_TEXTURES.map(t => t.label)

const N = ROAD_TEXTURES.length

// Flat path list for a single useTexture call — order: [color, rough, normal] × N textures
const ALL_ROAD_PATHS = ROAD_TEXTURES.flatMap(t => [t.color, t.rough, t.normal])

// ── save / load helpers ───────────────────────────────────────────────────────

// Encode a single mask's G-channel values into a grayscale PNG (base64 dataURL).
// PNG compression handles the large zero regions very efficiently.
function encodeMask(data) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = MASK_SIZE
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(MASK_SIZE, MASK_SIZE)
    for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
      const v = data[i * 4 + 1]           // G channel is the painted value
      img.data[i * 4]     = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    canvas.toBlob(blob => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    }, 'image/png')
  })
}

async function saveMap(masks) {
  const layers = await Promise.all(masks.map(m => encodeMask(m.data)))
  const json   = JSON.stringify({ version: 1, textures: ROAD_TEXTURE_LABELS, layers })
  const url    = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a      = Object.assign(document.createElement('a'), { href: url, download: 'terrain-map.json' })
  a.click()
  URL.revokeObjectURL(url)
}

function decodeMask(dataUrl, mask) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = MASK_SIZE
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, MASK_SIZE, MASK_SIZE)
      const px = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data
      for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
        const v = px[i * 4]               // R channel of the saved PNG
        mask.data[i * 4]     = v
        mask.data[i * 4 + 1] = v
        mask.data[i * 4 + 2] = v
        mask.data[i * 4 + 3] = 255
      }
      mask.tex.needsUpdate = true
      resolve()
    }
    img.src = dataUrl
  })
}

function loadMap(masks) {
  const input  = document.createElement('input')
  input.type   = 'file'
  input.accept = '.json'
  input.onchange = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { layers } = JSON.parse(await file.text())
      // Clear all masks then restore each saved layer
      masks.forEach(m => { m.data.fill(0); m.tex.needsUpdate = true })
      await Promise.all(layers.slice(0, masks.length).map((url, i) => decodeMask(url, masks[i])))
    } catch (err) {
      console.error('Failed to load terrain map:', err)
    }
  }
  input.click()
}

// Paint or erase into a mask DataTexture at the given UV position.
// RGBA layout (4 bytes/pixel) — Three.js alphaMap reads the .g channel.
// opacity (0-1) caps the maximum painted value so the texture can be semi-transparent.
function applyBrush(uvX, uvY, radiusWorld, data, tex, erase, opacity) {
  const cx     = Math.floor(uvX * MASK_SIZE)
  const cy     = Math.floor(uvY * MASK_SIZE)   // DataTexture flipY=false: row 0 = UV.y=0
  const rPx    = Math.max(2, Math.floor((radiusWorld / GROUND_SIZE) * MASK_SIZE))
  const maxVal = erase ? 0 : Math.floor(opacity * 255)

  for (let dy = -rPx; dy <= rPx; dy++) {
    for (let dx = -rPx; dx <= rPx; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > rPx) continue
      const t       = 1 - d / rPx
      const falloff = t * t * (3 - 2 * t)   // smoothstep — soft brush edge
      const px = cx + dx
      const py = cy + dy
      if (px < 0 || px >= MASK_SIZE || py < 0 || py >= MASK_SIZE) continue
      const base = (py * MASK_SIZE + px) * 4
      const cur  = data[base + 1]
      const next = erase
        ? Math.max(0,      cur - Math.floor(falloff * 180))
        : Math.min(maxVal, cur + Math.floor(falloff * 180))
      data[base]   = next   // R
      data[base+1] = next   // G  ← alphaMap reads this
      data[base+2] = next   // B
      data[base+3] = 255    // A
    }
  }
  tex.needsUpdate = true
}

export function Ground({ receiveShadow, paintMode, brushRadius, eraseMode, brushOpacity, selectedTexture }) {
  // ── one mask per texture layer ───────────────────────────────────────────────
  const masks = useMemo(() =>
    ROAD_TEXTURES.map(() => {
      const data = new Uint8Array(MASK_SIZE * MASK_SIZE * 4)
      const tex  = new THREE.DataTexture(data, MASK_SIZE, MASK_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
      tex.minFilter = tex.magFilter = THREE.LinearFilter
      tex.needsUpdate = true
      return { data, tex }
    })
  , [])

  // ── save / load buttons (merged into the Road Painting leva panel) ──────────
  useControls('Road Painting', {
    'Save Map': button(() => saveMap(masks)),
    'Load Map': button(() => loadMap(masks)),
  })

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
  // All road textures in one Suspense-friendly call: [color0, rough0, norm0, color1, ...]
  const roadTextures = useTexture(ALL_ROAD_PATHS)

  useMemo(() => {
    ;[grassColor, grassRough, grassNormal].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(12, 12)
    })
    roadTextures.forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(ROAD_REPEAT, ROAD_REPEAT)
    })
  }, [grassColor, grassRough, grassNormal, roadTextures])

  // ── painting logic ───────────────────────────────────────────────────────────
  // Erase clears all layers; paint writes only to the selected layer.
  const doPaint = useCallback((uv) => {
    if (eraseMode) {
      masks.forEach(({ data, tex }) => applyBrush(uv.x, uv.y, brushRadius, data, tex, true, brushOpacity))
    } else {
      const idx = ROAD_TEXTURES.findIndex(t => t.label === selectedTexture)
      if (idx >= 0) applyBrush(uv.x, uv.y, brushRadius, masks[idx].data, masks[idx].tex, false, brushOpacity)
    }
  }, [brushRadius, eraseMode, brushOpacity, masks, selectedTexture])

  // ── pointer handlers ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    if (!paintMode) return
    e.stopPropagation()
    isPainting.current = true
    if (e.uv) doPaint(e.uv)
  }, [paintMode, doPaint])

  const handlePointerMove = useCallback((e) => {
    if (!paintMode) return
    e.stopPropagation()
    cursorPos.current.copy(e.point)
    if (isPainting.current && e.uv) doPaint(e.uv)
  }, [paintMode, doPaint])

  // ── cursor ring ──────────────────────────────────────────────────────────────
  useFrame(() => {
    if (!cursorRef.current) return
    cursorRef.current.visible = paintMode
    if (paintMode) {
      cursorRef.current.position.set(cursorPos.current.x, 0.03, cursorPos.current.z)
      cursorRef.current.scale.set(brushRadius, brushRadius, 1)
    }
  })

  return (
    <>
      {/* ── grass base ──────────────────────────────────────────────────────── */}
      <mesh rotation={ROAD_ROT} position={[0, -0.02, 0]} receiveShadow={receiveShadow}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          map={grassColor}
          roughnessMap={grassRough}
          normalMap={grassNormal}
          roughness={1}
        />
      </mesh>

      {/* ── one overlay per texture, each with its own painted mask ─────────── */}
      {/* Tiny y-offset per layer avoids z-fighting between co-planar overlays. */}
      {/* Negative renderOrder ensures overlays render before leaves/rain so    */}
      {/* those transparent objects correctly appear on top via depth test.     */}
      {ROAD_TEXTURES.map((def, i) => (
        <mesh
          key={def.label}
          rotation={ROAD_ROT}
          position={[0, -0.02 + (i + 1) * 0.001, 0]}
          renderOrder={i - N}
        >
          <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
          <meshStandardMaterial
            map={roadTextures[i * 3]}
            roughnessMap={roadTextures[i * 3 + 1]}
            normalMap={roadTextures[i * 3 + 2]}
            alphaMap={masks[i].tex}
            transparent
            depthWrite
            roughness={0.9}
          />
        </mesh>
      ))}

      {/* ── transparent hit mesh — sole target for pointer events ────────────── */}
      <mesh
        rotation={ROAD_ROT}
        position={[0, 0.01, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* ── brush cursor ring ────────────────────────────────────────────────── */}
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
