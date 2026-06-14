'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { PlacedCandleLight } from '@dnd-table/types'

// ── CandleLightInstance ───────────────────────────────────────────────────────
// One PointLight + optional visual indicator per placed candle.
// Each instance gets a stable per-id phase offset so lights flicker independently.

interface InstanceProps {
  x: number; z: number
  color: string; radius: number; intensity: number
  phase: number
  showIndicator: boolean
}

function CandleLightInstance({ x, z, color, radius, intensity, phase, showIndicator }: InstanceProps) {
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame(() => {
    const light = lightRef.current
    if (!light) return
    const t = performance.now() * 0.001
    const flicker =
      0.55 +
      0.18 * Math.sin(t * 2.9  + phase) +
      0.14 * Math.sin(t * 7.3  + phase * 1.4) +
      0.09 * Math.sin(t * 14.7 + phase * 2.3) +
      0.04 * Math.sin(t * 28.1 + phase * 3.7)
    light.intensity = intensity * flicker
  })

  return (
    <group position={[x, 0, z]}>
      {/* Y=0.5 puts the light above both ground (Y=−0.02) and image overlays (Y=0.002)
          so Lambert dot(N,L) > 0 on all horizontal surfaces */}
      <pointLight ref={lightRef} color={color} position={[0, 0.5, 0]} distance={radius} decay={2} castShadow={false} />
      {showIndicator && (
        <mesh position={[0, 0.25, 0]}>
          <sphereGeometry args={[0.22, 8, 6]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  )
}

// ── PlacedCandleLights ────────────────────────────────────────────────────────
// Renders all placed candle lights. showIndicators = true in the control view,
// false in the display view (lights still work; indicators would break immersion).

interface PlacedCandleLightsProps {
  candles:        PlacedCandleLight[]
  showIndicators: boolean
}

export function PlacedCandleLights({ candles, showIndicators }: PlacedCandleLightsProps) {
  // Stable per-id phase offsets — preserved when candles are added/removed mid-array.
  const phaseMap = useRef(new Map<string, number>())
  candles.forEach(c => {
    if (!phaseMap.current.has(c.id)) phaseMap.current.set(c.id, Math.random() * Math.PI * 2)
  })

  return (
    <>
      {candles.map(c => (
        <CandleLightInstance
          key={c.id}
          x={c.x} z={c.z}
          color={c.color}
          radius={c.radius}
          intensity={c.intensity}
          phase={phaseMap.current.get(c.id) ?? 0}
          showIndicator={showIndicators}
        />
      ))}
    </>
  )
}

// ── CandlePlacer ─────────────────────────────────────────────────────────────
// Transparent hit plane active only when candle placement mode is on.
// Left-click places; in erase mode left-click removes the nearest candle.

interface CandlePlacerProps {
  enabled:   boolean
  eraseMode: boolean
  onPlace:   (x: number, z: number) => void
  onRemove:  (x: number, z: number) => void
}

export function CandlePlacer({ enabled, eraseMode, onPlace, onRemove }: CandlePlacerProps) {
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false,
  }), [])

  if (!enabled) return null

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (eraseMode) onRemove(e.point.x, e.point.z)
    else           onPlace(e.point.x, e.point.z)
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.06, 0]}
      material={hitMat}
      onPointerDown={handlePointerDown}
    >
      <planeGeometry args={[200, 200]} />
    </mesh>
  )
}
