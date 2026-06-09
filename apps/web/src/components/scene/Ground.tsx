'use client'

import { useRef, useMemo, useCallback, useEffect, useState, Suspense } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
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


// ── save / load helpers ───────────────────────────────────────────────────────

export interface Mask { data: Uint8Array; tex: THREE.DataTexture }

export function encodeMask(data: Uint8Array): Promise<string> {
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

export function decodeMask(dataUrl: string, mask: Mask): Promise<void> {
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
export function applyBrush(
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

// ── terrain baking ────────────────────────────────────────────────────────────

const BAKE_SIZE = 2048

// Lighting snapshot passed from ControlScene at save time so the bake
// captures the exact same appearance as the control route.
export interface BakeLighting {
  hemSkyColor:    string
  hemGroundColor: string
  hemIntensity:   number
  sunColor:       string
  sunIntensity:   number
  sunPosition:    [number, number, number]
}

function bakeGround(
  gl:                  THREE.WebGLRenderer,
  masks:               Mask[],
  roadTexturesByLayer: (THREE.Texture[] | null)[],
  grassColor:          THREE.Texture,
  lighting:            BakeLighting,
): Promise<string> {
  const rt = new THREE.WebGLRenderTarget(BAKE_SIZE, BAKE_SIZE, {
    format:        THREE.RGBAFormat,
    type:          THREE.UnsignedByteType,
    depthBuffer:   true,
    stencilBuffer: false,
  })

  const cam = new THREE.OrthographicCamera(
    -GROUND_SIZE / 2, GROUND_SIZE / 2,
    GROUND_SIZE / 2, -GROUND_SIZE / 2,
    0.01, 10,
  )
  cam.position.set(0, 1, 0)
  cam.lookAt(0, 0, 0)

  const bakeScene = new THREE.Scene()
  const ROT = new THREE.Euler(-Math.PI / 2, 0, 0)

  // Match the scene's current lighting so the bake looks identical to the control route.
  bakeScene.add(new THREE.HemisphereLight(
    new THREE.Color(lighting.hemSkyColor),
    new THREE.Color(lighting.hemGroundColor),
    lighting.hemIntensity,
  ))
  const sun = new THREE.DirectionalLight(new THREE.Color(lighting.sunColor), lighting.sunIntensity)
  sun.position.set(...lighting.sunPosition)
  bakeScene.add(sun)

  // Grass base — Lambert matches the live scene material (no PBR on grass).
  const grassMat  = new THREE.MeshLambertMaterial({ map: grassColor })
  const grassMesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), grassMat)
  grassMesh.rotation.copy(ROT)
  bakeScene.add(grassMesh)

  // Painted road overlays — only include layers with painted content and loaded textures
  for (let i = 0; i < ROAD_TEXTURES.length; i++) {
    const texs = roadTexturesByLayer[i]
    if (!texs) continue

    let hasContent = false
    const d = masks[i].data
    for (let p = 1; p < d.length; p += 4) { if (d[p] > 4) { hasContent = true; break } }
    if (!hasContent) continue

    const mat  = new THREE.MeshStandardMaterial({
      map:          texs[0],
      roughnessMap: texs[1],
      normalMap:    texs[2],
      alphaMap:     masks[i].tex,
      transparent:  true,
      depthWrite:   false,
      roughness:    0.9,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), mat)
    mesh.rotation.copy(ROT)
    mesh.position.y = 0.001 * (i + 1)
    bakeScene.add(mesh)
  }

  // Save renderer state
  const prevTarget     = gl.getRenderTarget()
  const prevClearColor = new THREE.Color()
  const prevClearAlpha = gl.getClearAlpha()
  gl.getClearColor(prevClearColor)
  const prevAutoClear  = gl.autoClear

  gl.setRenderTarget(rt)
  gl.autoClear = true
  gl.setClearColor(0x000000, 1)
  gl.clear()
  gl.render(bakeScene, cam)

  const pixels = new Uint8Array(BAKE_SIZE * BAKE_SIZE * 4)
  gl.readRenderTargetPixels(rt, 0, 0, BAKE_SIZE, BAKE_SIZE, pixels)

  // Restore
  gl.setRenderTarget(prevTarget)
  gl.setClearColor(prevClearColor, prevClearAlpha)
  gl.autoClear = prevAutoClear

  // WebGL origin is bottom-left; Canvas origin is top-left — flip Y
  const canvas  = document.createElement('canvas')
  canvas.width  = canvas.height = BAKE_SIZE
  const ctx     = canvas.getContext('2d')!
  const imgData = ctx.createImageData(BAKE_SIZE, BAKE_SIZE)
  for (let y = 0; y < BAKE_SIZE; y++) {
    const srcOff = (BAKE_SIZE - 1 - y) * BAKE_SIZE * 4
    const dstOff = y * BAKE_SIZE * 4
    imgData.data.set(pixels.subarray(srcOff, srcOff + BAKE_SIZE * 4), dstOff)
  }
  ctx.putImageData(imgData, 0, 0)

  // Dispose bake-only resources — null texture refs before dispose so Three.js
  // doesn't destroy the shared textures that the live scene is still using.
  bakeScene.traverse(obj => {
    const m = obj as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    mats.forEach(mat => {
      const std = mat as THREE.MeshStandardMaterial
      std.map = std.roughnessMap = std.normalMap = std.alphaMap = null
      mat.dispose()
    })
  })
  rt.dispose()

  return new Promise(resolve => {
    canvas.toBlob(
      blob => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob!)
      },
      'image/jpeg',
      0.92,
    )
  })
}

// ── ioRef type (shared with ControlScene) ────────────────────────────────────

export interface GroundIO {
  save: () => Promise<string[]>
  load: (layers: string[]) => Promise<void>
  bake: (lighting: BakeLighting) => Promise<string>
}

// ── Per-layer road overlay ────────────────────────────────────────────────────
// Loaded lazily inside <Suspense> — only mounts when a layer has painted content
// or is selected for painting. Loads 3 PBR textures (color/rough/normal) and
// registers them via onReady so bakeGround can access them at save time.

interface RoadOverlayProps {
  texDef:       typeof ROAD_TEXTURES[number]
  mask:         Mask
  receiveShadow: boolean
  index:        number
  onReady:      (textures: THREE.Texture[]) => void
}

function RoadOverlay({ texDef, mask, receiveShadow, index, onReady }: RoadOverlayProps) {
  const [color, rough, normal] = useTexture([texDef.color, texDef.rough, texDef.normal])

  useMemo(() => {
    ;[color, rough, normal].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(ROAD_REPEAT, ROAD_REPEAT)
      t.needsUpdate = true
    })
    onReady([color, rough, normal])
  // onReady is a stable ref callback — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, rough, normal])

  return (
    <mesh
      rotation={ROAD_ROT}
      position={[0, -0.02 + (index + 1) * 0.001, 0]}
      renderOrder={index - N}
      receiveShadow={receiveShadow}
    >
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial
        map={color}
        roughnessMap={rough}
        normalMap={normal}
        alphaMap={mask.tex}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-4}
        roughness={0.9}
      />
    </mesh>
  )
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
  const { gl } = useThree()

  const masks = useMemo<Mask[]>(() =>
    ROAD_TEXTURES.map(() => {
      const data = new Uint8Array(MASK_SIZE * MASK_SIZE * 4)
      const tex  = new THREE.DataTexture(data, MASK_SIZE, MASK_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
      tex.minFilter = tex.magFilter = THREE.LinearFilter
      tex.needsUpdate = true
      return { data, tex }
    })
  , [])

  const isPainting = useRef(false)
  const cursorRef  = useRef<THREE.Mesh>(null)
  const cursorPos  = useRef(new THREE.Vector3())

  // Which layers are mounted (have content or are selected for painting).
  // Starts empty — layers activate on scene load or first paint stroke.
  const [activeLayers, setActiveLayers] = useState<boolean[]>(() => new Array(N).fill(false))

  // Per-layer loaded textures — populated by RoadOverlay.onReady callbacks.
  // Used by bakeGround at save time to avoid re-loading.
  const roadTextureRefs = useRef<(THREE.Texture[] | null)[]>(new Array(N).fill(null))

  // Stable callbacks (one per layer) — never recreated so RoadOverlay deps stay stable.
  const onReadyCbs = useRef(
    ROAD_TEXTURES.map((_, i) => (texs: THREE.Texture[]) => { roadTextureRefs.current[i] = texs })
  )

  useEffect(() => {
    const stop = () => {
      if (isPainting.current) onChange?.()
      isPainting.current = false
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [onChange])

  // Pre-activate the selected texture layer so it loads before the user paints.
  useEffect(() => {
    const idx = ROAD_TEXTURES.findIndex(t => t.label === selectedTexture)
    if (idx >= 0) setActiveLayers(prev => {
      if (prev[idx]) return prev
      const next = [...prev]; next[idx] = true; return next
    })
  }, [selectedTexture])

  const grassColor = useTexture('/textures/moss_ground_03_2k/moss_groud_03_Base_Color_2k.png')

  useMemo(() => {
    grassColor.wrapS = grassColor.wrapT = THREE.RepeatWrapping
    grassColor.repeat.set(12, 12)
  }, [grassColor])

  useEffect(() => {
    if (!ioRef) return
    ioRef.current = {
      save: () => Promise.all(masks.map(m => encodeMask(m.data))),
      load: async (layers) => {
        masks.forEach(m => { m.data.fill(0); m.tex.needsUpdate = true })
        await Promise.all(layers.slice(0, masks.length).map((url, i) => url ? decodeMask(url, masks[i]) : undefined))
        // Activate layers that have painted content so their textures load.
        setActiveLayers(prev => prev.map((_, i) => {
          const d = masks[i].data
          for (let p = 1; p < d.length; p += 4) if (d[p] > 4) return true
          return false
        }))
      },
      bake: (lighting) => bakeGround(gl, masks, roadTextureRefs.current, grassColor, lighting),
    }
  // roadTextureRefs is a stable ref — reading .current at call time, no dep needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ioRef, masks, gl, grassColor])

  const doPaint = useCallback((uv: THREE.Vector2) => {
    if (eraseMode) {
      masks.forEach(({ data, tex }) => applyBrush(uv.x, uv.y, brushRadius, data, tex, true, brushOpacity))
    } else {
      const idx = ROAD_TEXTURES.findIndex(t => t.label === selectedTexture)
      if (idx >= 0) {
        applyBrush(uv.x, uv.y, brushRadius, masks[idx].data, masks[idx].tex, false, brushOpacity)
        // Ensure the layer is active so its textures load (idempotent if already active).
        setActiveLayers(prev => {
          if (prev[idx]) return prev
          const next = [...prev]; next[idx] = true; return next
        })
      }
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
        <meshLambertMaterial map={grassColor} />
      </mesh>

      {ROAD_TEXTURES.map((def, i) => (
        activeLayers[i] ? (
          <Suspense key={def.label} fallback={null}>
            <RoadOverlay
              texDef={def}
              mask={masks[i]}
              receiveShadow={receiveShadow}
              index={i}
              onReady={onReadyCbs.current[i]}
            />
          </Suspense>
        ) : null
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
