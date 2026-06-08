'use client'

import { useRef, useMemo, useCallback, useEffect } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

const GROUND_SIZE = 80
const MASK_SIZE   = 512
const ROAD_ROT    = [-Math.PI / 2, 0, 0] as const
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
const ALL_ROAD_PATHS = ROAD_TEXTURES.flatMap(t => [t.color, t.rough, t.normal])

// ── save / load helpers ───────────────────────────────────────────────────────

interface Mask { data: Uint8Array; tex: THREE.DataTexture }

function encodeMask(data: Uint8Array): Promise<string> {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = MASK_SIZE
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(MASK_SIZE, MASK_SIZE)
    for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
      const v = data[i * 4 + 1]
      img.data[i * 4]     = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    canvas.toBlob(blob => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob!)
    }, 'image/png')
  })
}

function decodeMask(dataUrl: string, mask: Mask): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = MASK_SIZE
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, MASK_SIZE, MASK_SIZE)
      const px = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data
      for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
        const v = px[i * 4]
        mask.data[i * 4]     = v
        mask.data[i * 4 + 1] = v
        mask.data[i * 4 + 2] = v
        mask.data[i * 4 + 3] = 255
      }
      mask.tex.needsUpdate = true
      resolve()
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// Paint or erase into a mask DataTexture at the given UV position.
// RGBA layout (4 bytes/pixel) — Three.js alphaMap reads the .g channel.
function applyBrush(
  uvX: number, uvY: number, radiusWorld: number,
  data: Uint8Array, tex: THREE.DataTexture,
  erase: boolean, opacity: number,
) {
  const cx     = Math.floor(uvX * MASK_SIZE)
  const cy     = Math.floor(uvY * MASK_SIZE)
  const rPx    = Math.max(2, Math.floor((radiusWorld / GROUND_SIZE) * MASK_SIZE))
  const maxVal = erase ? 0 : Math.floor(opacity * 255)

  for (let dy = -rPx; dy <= rPx; dy++) {
    for (let dx = -rPx; dx <= rPx; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > rPx) continue
      const t       = 1 - d / rPx
      const falloff = t * t * (3 - 2 * t)
      const px = cx + dx
      const py = cy + dy
      if (px < 0 || px >= MASK_SIZE || py < 0 || py >= MASK_SIZE) continue
      const base = (py * MASK_SIZE + px) * 4
      const cur  = data[base + 1]
      const next = erase
        ? Math.max(0,      cur - Math.floor(falloff * 180))
        : Math.min(maxVal, cur + Math.floor(falloff * 180))
      data[base]   = next
      data[base+1] = next
      data[base+2] = next
      data[base+3] = 255
    }
  }
  tex.needsUpdate = true
}

// ── ioRef type (shared with ControlScene) ────────────────────────────────────

export interface GroundIO {
  save: () => Promise<string[]>
  load: (layers: string[]) => Promise<void>
}

// ── component ─────────────────────────────────────────────────────────────────

interface GroundProps {
  receiveShadow: boolean
  paintMode: boolean
  brushRadius: number
  brushOpacity: number
  eraseMode: boolean
  selectedTexture: string
  ioRef?: React.MutableRefObject<GroundIO | undefined>
  onChange?: () => void
}

export function Ground({
  receiveShadow, paintMode, brushRadius, brushOpacity, eraseMode, selectedTexture, ioRef, onChange,
}: GroundProps) {
  const masks = useMemo<Mask[]>(() =>
    ROAD_TEXTURES.map(() => {
      const data = new Uint8Array(MASK_SIZE * MASK_SIZE * 4)
      const tex  = new THREE.DataTexture(data, MASK_SIZE, MASK_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
      tex.minFilter = tex.magFilter = THREE.LinearFilter
      tex.needsUpdate = true
      return { data, tex }
    })
  , [])

  useEffect(() => {
    if (!ioRef) return
    ioRef.current = {
      save: () => Promise.all(masks.map(m => encodeMask(m.data))),
      load: async (layers) => {
        masks.forEach(m => { m.data.fill(0); m.tex.needsUpdate = true })
        await Promise.all(layers.slice(0, masks.length).map((url, i) => decodeMask(url, masks[i])))
      },
    }
  }, [ioRef, masks])

  const isPainting = useRef(false)
  const cursorRef  = useRef<THREE.Mesh>(null)
  const cursorPos  = useRef(new THREE.Vector3())

  useEffect(() => {
    const stop = () => {
      if (isPainting.current) onChange?.()
      isPainting.current = false
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [onChange])

  const [grassColor, grassRough, grassNormal] = useTexture([
    '/textures/moss_ground_03_2k/moss_groud_03_Base_Color_2k.png',
    '/textures/moss_ground_03_2k/moss_groud_03_Roughness_2k.png',
    '/textures/moss_ground_03_2k/moss_groud_03_Normal_gl_2k.png',
  ])
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

  const doPaint = useCallback((uv: THREE.Vector2) => {
    if (eraseMode) {
      masks.forEach(({ data, tex }) => applyBrush(uv.x, uv.y, brushRadius, data, tex, true, brushOpacity))
    } else {
      const idx = ROAD_TEXTURES.findIndex(t => t.label === selectedTexture)
      if (idx >= 0) applyBrush(uv.x, uv.y, brushRadius, masks[idx].data, masks[idx].tex, false, brushOpacity)
    }
  }, [brushRadius, eraseMode, brushOpacity, masks, selectedTexture])

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!paintMode) return
    e.stopPropagation()
    isPainting.current = true
    if (e.uv) doPaint(e.uv)
  }, [paintMode, doPaint])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!paintMode) return
    e.stopPropagation()
    cursorPos.current.copy(e.point)
    if (isPainting.current && e.uv) doPaint(e.uv)
  }, [paintMode, doPaint])

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
      <mesh rotation={ROAD_ROT} position={[0, -0.02, 0]} receiveShadow={receiveShadow}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          map={grassColor}
          roughnessMap={grassRough}
          normalMap={grassNormal}
          roughness={1}
        />
      </mesh>

      {ROAD_TEXTURES.map((def, i) => (
        <mesh
          key={def.label}
          rotation={ROAD_ROT}
          position={[0, -0.02 + (i + 1) * 0.001, 0]}
          renderOrder={i - N}
          receiveShadow={receiveShadow}
        >
          <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
          <meshStandardMaterial
            map={roadTextures[i * 3]}
            roughnessMap={roadTextures[i * 3 + 1]}
            normalMap={roadTextures[i * 3 + 2]}
            alphaMap={masks[i].tex}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-4}
            roughness={0.9}
          />
        </mesh>
      ))}

      {/* Transparent hit mesh — sole target for pointer events during painting */}
      <mesh
        rotation={ROAD_ROT}
        position={[0, 0.01, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

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
