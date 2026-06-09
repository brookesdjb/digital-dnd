'use client'

// Display (TV/iPad) scene — read-only, driven by Supabase Realtime via useSceneSync.

import { Suspense, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { DirectionalLight } from 'three'
import { Rain } from './Rain'
import { Scatter } from './Scatter'
import { Ground, ROAD_TEXTURE_LABELS } from './Ground'
import type { GroundIO } from './Ground'
import { BakedGround } from './BakedGround'
import { BattleGrid } from './BattleGrid'
import { FogLayer } from './FogLayer'
import type { FogIO } from './FogLayer'
import { PlacedObjectsRenderer } from './PlacedObjectsRenderer'
import { MapImages } from './MapImages'
import { useSceneSync } from '@/lib/sync/useSceneSync'
import { PerfSampler, PerformanceOverlay } from './PerformanceHUD'

const DEFAULT_FOV = 45

interface DisplaySceneProps {
  tableId: string
}

export default function DisplayScene({ tableId }: DisplaySceneProps) {
  const groundIO = useRef<GroundIO>(undefined)
  const fogIO    = useRef<FogIO>(undefined)
  const lightRef = useRef<DirectionalLight>(null)
  const showPerf = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf')
  const {
    objects, screenW, screenH,
    bgColor, rainIntensity, showGrid,
    hemSkyColor, hemGroundColor, hemIntensity,
    sunColor, sunIntensity, sunAzimuth, sunElevation,
    fogEnabled, fogColor, fogDensity,
    shadowMode, shadowRadius, aoRadius, aoIntensity, blobSize, blobOpacity,
    windSpeed, windStrength,
    fowColor, fowDisplayOpacity,
    bakedGround, mapImages,
  } = useSceneSync(tableId, groundIO, fogIO)

  const fieldSize = Math.ceil(Math.max(screenW, screenH)) + 8
  const initH     = screenH / (2 * Math.tan((DEFAULT_FOV * Math.PI / 180) / 2))

  const useSoftShadows = shadowMode === 'Soft Shadows' || shadowMode === 'Soft Shadows + SSAO'
  const useSSAO        = shadowMode === 'SSAO'         || shadowMode === 'Soft Shadows + SSAO'
  const showBlobs      = shadowMode === 'Blob'

  // Bake shadow map once when soft shadows become active or sun moves — never re-render each frame.
  useEffect(() => {
    const light = lightRef.current
    if (!light || !useSoftShadows) return
    light.shadow.autoUpdate = false
    light.shadow.needsUpdate = true
  }, [useSoftShadows, sunAzimuth, sunElevation])

  const az = sunAzimuth   * Math.PI / 180
  const el = sunElevation * Math.PI / 180
  const sunDist = fieldSize
  const sunPos: [number, number, number] = [
    Math.cos(el) * Math.sin(az) * sunDist,
    Math.sin(el) * sunDist,
    Math.cos(el) * Math.cos(az) * sunDist,
  ]
  const shadowHalf = fieldSize / 2

  return (
    <div style={{ width: '100%', height: '100%', background: bgColor }}>
      <Canvas
        shadows
        camera={{ position: [0, initH, 0.001], fov: DEFAULT_FOV, near: 0.1, far: 300 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <color attach="background" args={[bgColor]} />
        {fogEnabled && <fogExp2 attach="fog" args={[fogColor, fogDensity]} />}

        <hemisphereLight color={hemSkyColor} groundColor={hemGroundColor} intensity={hemIntensity} />
        <directionalLight
          ref={lightRef}
          castShadow={useSoftShadows}
          position={sunPos}
          color={sunColor}
          intensity={sunIntensity}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-shadowHalf}
          shadow-camera-right={shadowHalf}
          shadow-camera-top={shadowHalf}
          shadow-camera-bottom={-shadowHalf}
          shadow-camera-near={1}
          shadow-camera-far={sunDist * 2}
          shadow-bias={-0.001}
          shadow-radius={shadowRadius}
        />

        <Suspense fallback={null}>
          {bakedGround
            ? <BakedGround dataUrl={bakedGround} />
            : <Ground
                receiveShadow={useSoftShadows}
                paintMode={false}
                brushRadius={3}
                brushOpacity={1}
                eraseMode={false}
                selectedTexture={ROAD_TEXTURE_LABELS[0]}
                ioRef={groundIO}
              />
          }
          <Scatter
            windSpeed={windSpeed}
            windStrength={windStrength}
            showBlobs={showBlobs}
            usePCSS={useSoftShadows}
            blobSize={blobSize}
            blobOpacity={blobOpacity}
            fieldSize={fieldSize}
          />
          <FogLayer
            paintMode={false}
            eraseMode={false}
            tool="brush"
            brushRadius={4}
            fogColor={fowColor}
            opacity={fowDisplayOpacity}
            ioRef={fogIO}
          />
          <BattleGrid
            screenW={screenW}
            screenH={screenH}
            visible={showGrid}
            showBorder={true}
          />
          <PlacedObjectsRenderer
            objects={objects}
            showBlobs={showBlobs}
            blobSize={blobSize}
            blobOpacity={blobOpacity}
            castShadow={useSoftShadows}
          />
          <MapImages images={mapImages} />
        </Suspense>

        <Rain intensity={rainIntensity} fieldSize={fieldSize} />

        {showPerf && <PerfSampler />}

        {useSSAO && (
          <EffectComposer>
            <N8AO color="black" aoRadius={aoRadius} intensity={aoIntensity} aoSamples={16} quality="medium" />
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>
      {showPerf && <PerformanceOverlay />}
    </div>
  )
}
