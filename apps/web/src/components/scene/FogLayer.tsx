'use client'

import { useRef, useMemo, useCallback, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { encodeMask, decodeMask, applyBrush, type Mask } from './Ground'

const GROUND_SIZE = 80
const MASK_SIZE   = 512
const FOG_ROT     = [-Math.PI / 2, 0, 0] as const

export interface FogIO {
  save:  () => Promise<string>
  load:  (mask: string) => Promise<void>
  clear: () => void
  fill:  () => void
}

// Fill a rectangle of the DataTexture defined by two UV corners.
function fillRect(
  uv1: THREE.Vector2, uv2: THREE.Vector2,
  data: Uint8Array, tex: THREE.DataTexture,
  erase: boolean,
) {
  const x1 = Math.floor(Math.min(uv1.x, uv2.x) * MASK_SIZE)
  const x2 = Math.ceil( Math.max(uv1.x, uv2.x) * MASK_SIZE)
  const y1 = Math.floor(Math.min(uv1.y, uv2.y) * MASK_SIZE)
  const y2 = Math.ceil( Math.max(uv1.y, uv2.y) * MASK_SIZE)
  const val = erase ? 0 : 255
  for (let py = Math.max(0, y1); py < Math.min(MASK_SIZE, y2); py++) {
    for (let px = Math.max(0, x1); px < Math.min(MASK_SIZE, x2); px++) {
      const base = (py * MASK_SIZE + px) * 4
      data[base] = data[base + 1] = data[base + 2] = val
      data[base + 3] = 255
    }
  }
  tex.needsUpdate = true
}

interface FogLayerProps {
  paintMode:   boolean
  eraseMode:   boolean
  tool:        'brush' | 'rect'
  brushRadius: number
  fogColor:    string
  opacity:     number
  ioRef?:      React.MutableRefObject<FogIO | undefined>
  onChange?:   () => void
}

export function FogLayer({ paintMode, eraseMode, tool, brushRadius, fogColor, opacity, ioRef, onChange }: FogLayerProps) {
  const mask = useMemo<Mask>(() => {
    const data = new Uint8Array(MASK_SIZE * MASK_SIZE * 4)
    const tex  = new THREE.DataTexture(data, MASK_SIZE, MASK_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return { data, tex }
  }, [])

  useEffect(() => {
    if (!ioRef) return
    ioRef.current = {
      save:  () => encodeMask(mask.data),
      load:  (dataUrl: string) => decodeMask(dataUrl, mask),
      clear: () => { mask.data.fill(0); mask.tex.needsUpdate = true },
      fill:  () => {
        for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
          mask.data[i * 4]     = 255
          mask.data[i * 4 + 1] = 255
          mask.data[i * 4 + 2] = 255
          mask.data[i * 4 + 3] = 255
        }
        mask.tex.needsUpdate = true
      },
    }
  }, [ioRef, mask])

  // Refs so the stable `stop` callback always sees current prop values.
  const toolRef  = useRef(tool)
  const eraseRef = useRef(eraseMode)
  useEffect(() => { toolRef.current  = tool      }, [tool])
  useEffect(() => { eraseRef.current = eraseMode }, [eraseMode])

  // Brush mode state
  const isPainting    = useRef(false)
  const cursorRef     = useRef<THREE.Mesh>(null)
  const cursorPos     = useRef(new THREE.Vector3())

  // Rect mode state
  const isDragging     = useRef(false)
  const dragStartWorld = useRef(new THREE.Vector3())
  const dragEndWorld   = useRef(new THREE.Vector3())
  const dragStartUV    = useRef(new THREE.Vector2())
  const dragEndUV      = useRef(new THREE.Vector2())
  const rectPreviewRef = useRef<THREE.Mesh>(null)

  const stop = useCallback(() => {
    if (toolRef.current === 'rect' && isDragging.current) {
      fillRect(dragStartUV.current, dragEndUV.current, mask.data, mask.tex, eraseRef.current)
      isDragging.current = false
      onChange?.()
    } else if (isPainting.current) {
      isPainting.current = false
      onChange?.()
    }
  }, [mask, onChange])

  useEffect(() => {
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [stop])

  const doPaint = useCallback((uv: THREE.Vector2) => {
    applyBrush(uv.x, uv.y, brushRadius, mask.data, mask.tex, eraseMode, 1.0)
  }, [brushRadius, eraseMode, mask])

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!paintMode) return
    e.stopPropagation()
    if (tool === 'rect') {
      isDragging.current = true
      dragStartWorld.current.copy(e.point)
      dragEndWorld.current.copy(e.point)
      if (e.uv) { dragStartUV.current.copy(e.uv); dragEndUV.current.copy(e.uv) }
    } else {
      isPainting.current = true
      if (e.uv) doPaint(e.uv)
    }
  }, [paintMode, tool, doPaint])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!paintMode) return
    e.stopPropagation()
    cursorPos.current.copy(e.point)
    if (tool === 'rect') {
      if (isDragging.current) {
        dragEndWorld.current.copy(e.point)
        if (e.uv) dragEndUV.current.copy(e.uv)
      }
    } else {
      if (isPainting.current && e.uv) doPaint(e.uv)
    }
  }, [paintMode, tool, doPaint])

  useFrame(() => {
    // Brush cursor: visible when in brush mode; hidden while rect-dragging
    if (cursorRef.current) {
      const showCursor = paintMode && (tool === 'brush' || (tool === 'rect' && !isDragging.current))
      cursorRef.current.visible = showCursor
      if (showCursor) {
        cursorRef.current.position.set(cursorPos.current.x, 0.06, cursorPos.current.z)
        cursorRef.current.scale.set(
          tool === 'rect' ? 0.5 : brushRadius,
          tool === 'rect' ? 0.5 : brushRadius,
          1,
        )
      }
    }
    // Rect preview: visible only while dragging
    if (rectPreviewRef.current) {
      const show = paintMode && tool === 'rect' && isDragging.current
      rectPreviewRef.current.visible = show
      if (show) {
        const p1 = dragStartWorld.current
        const p2 = dragEndWorld.current
        rectPreviewRef.current.position.set((p1.x + p2.x) / 2, 0.055, (p1.z + p2.z) / 2)
        // PlaneGeometry(1,1) with FOG_ROT: scale.x = world X, scale.y = world Z
        rectPreviewRef.current.scale.set(Math.abs(p2.x - p1.x) || 0.01, Math.abs(p2.z - p1.z) || 0.01, 1)
      }
    }
  })

  const cursorColor = eraseMode ? '#44dd88' : '#cc3333'

  return (
    <>
      {/* Fog overlay — renderOrder 2: above blob shadows (0,1), below grid */}
      <mesh rotation={FOG_ROT} position={[0, 0.04, 0]} renderOrder={2}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshBasicMaterial
          color={fogColor}
          alphaMap={mask.tex}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Hit mesh — highest y, intercepts pointer events first when painting */}
      <mesh
        rotation={FOG_ROT}
        position={[0, 0.05, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Brush / crosshair cursor (both modes when not dragging) */}
      <mesh ref={cursorRef} rotation={FOG_ROT} visible={false}>
        <ringGeometry args={[0.88, 1, 64]} />
        <meshBasicMaterial color={cursorColor} transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Rect drag preview */}
      <mesh ref={rectPreviewRef} rotation={FOG_ROT} visible={false} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={cursorColor} transparent opacity={0.2} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}
