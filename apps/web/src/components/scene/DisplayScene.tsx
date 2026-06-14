'use client'

// Display (TV/iPad) scene — read-only, driven by Supabase Realtime via useSceneSync.

import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { DirectionalLight, HemisphereLight, PerspectiveCamera } from 'three'
import { Rain } from './Rain'
import { AmbientEffects } from './AmbientEffects'
import { Scatter } from './Scatter'
import { Ground, ROAD_TEXTURE_LABELS } from './Ground'
import type { GroundIO } from './Ground'
import { BakedGround } from './BakedGround'
import { BattleGrid } from './BattleGrid'
import { FogLayer } from './FogLayer'
import type { FogIO } from './FogLayer'
import { PlacedObjectsRenderer } from './PlacedObjectsRenderer'
import { PlacedCandleLights } from './PlacedCandleLights'
import { MapImages } from './MapImages'
import { SceneSounds } from './SceneSounds'
import { useSceneSync } from '@/lib/sync/useSceneSync'
import { PerfSampler, PerformanceOverlay } from './PerformanceHUD'

const DEFAULT_FOV = 45

// Updates camera height whenever screen dimensions change (Canvas camera prop is only read once).
function CameraController({ screenH }: { screenH: number }) {
  const camera = useThree(s => s.camera) as PerspectiveCamera
  useEffect(() => {
    const h = screenH / (2 * Math.tan((DEFAULT_FOV * Math.PI / 180) / 2))
    camera.position.set(0, h, 0.001)
    camera.updateProjectionMatrix()
  }, [camera, screenH])
  return null
}

interface TweenProps {
  hemLightRef: React.RefObject<HemisphereLight | null>
  sunLightRef: React.RefObject<DirectionalLight | null>
  hemSkyColor: string; hemGroundColor: string; hemIntensity: number
  sunColor: string; sunIntensity: number
  sunAzimuth: number; sunElevation: number; sunDist: number
  fogEnabled: boolean; fogColor: string; fogDensity: number
}

// Smoothly interpolates lighting values so slider changes tween rather than snap on the display.
function SceneTweener({ hemLightRef, sunLightRef,
  hemSkyColor, hemGroundColor, hemIntensity,
  sunColor, sunIntensity, sunAzimuth, sunElevation, sunDist,
  fogEnabled, fogColor, fogDensity,
}: TweenProps) {
  const cur = useRef({
    hemIntensity, sunIntensity, sunAzimuth, sunElevation, fogDensity,
    hemSky:    new THREE.Color(hemSkyColor),
    hemGround: new THREE.Color(hemGroundColor),
    sunCol:    new THREE.Color(sunColor),
    fogCol:    new THREE.Color(fogColor),
  })
  const tgt = useRef({
    hemSky:    new THREE.Color(hemSkyColor),
    hemGround: new THREE.Color(hemGroundColor),
    sunCol:    new THREE.Color(sunColor),
    fogCol:    new THREE.Color(fogColor),
  })
  useEffect(() => { tgt.current.hemSky.set(hemSkyColor) },    [hemSkyColor])
  useEffect(() => { tgt.current.hemGround.set(hemGroundColor) }, [hemGroundColor])
  useEffect(() => { tgt.current.sunCol.set(sunColor) },       [sunColor])
  useEffect(() => { tgt.current.fogCol.set(fogColor) },       [fogColor])

  useFrame((state, delta) => {
    const λ = 6  // decay constant: reaches ~95% of target in 500ms
    const α = 1 - Math.exp(-λ * delta)
    cur.current.hemIntensity = THREE.MathUtils.damp(cur.current.hemIntensity, hemIntensity, λ, delta)
    cur.current.sunIntensity = THREE.MathUtils.damp(cur.current.sunIntensity, sunIntensity, λ, delta)
    cur.current.sunAzimuth   = THREE.MathUtils.damp(cur.current.sunAzimuth,   sunAzimuth,   λ, delta)
    cur.current.sunElevation = THREE.MathUtils.damp(cur.current.sunElevation, sunElevation, λ, delta)
    cur.current.fogDensity   = THREE.MathUtils.damp(cur.current.fogDensity,   fogDensity,   λ, delta)
    cur.current.hemSky.lerp(tgt.current.hemSky, α)
    cur.current.hemGround.lerp(tgt.current.hemGround, α)
    cur.current.sunCol.lerp(tgt.current.sunCol, α)
    cur.current.fogCol.lerp(tgt.current.fogCol, α)

    const hem = hemLightRef.current
    if (hem) {
      hem.intensity = cur.current.hemIntensity
      hem.color.copy(cur.current.hemSky)
      hem.groundColor.copy(cur.current.hemGround)
    }
    const sun = sunLightRef.current
    if (sun) {
      sun.intensity = cur.current.sunIntensity
      sun.color.copy(cur.current.sunCol)
      const az = cur.current.sunAzimuth   * Math.PI / 180
      const el = cur.current.sunElevation * Math.PI / 180
      sun.position.set(
        Math.cos(el) * Math.sin(az) * sunDist,
        Math.sin(el) * sunDist,
        Math.cos(el) * Math.cos(az) * sunDist,
      )
    }
    if (fogEnabled && state.scene.fog instanceof THREE.FogExp2) {
      state.scene.fog.density = cur.current.fogDensity
      state.scene.fog.color.copy(cur.current.fogCol)
    }
  })
  return null
}

interface DisplaySceneProps {
  tableId: string
}

export default function DisplayScene({ tableId }: DisplaySceneProps) {
  const groundIO   = useRef<GroundIO>(undefined)
  const fogIO      = useRef<FogIO>(undefined)
  const lightRef   = useRef<DirectionalLight>(null)
  const hemLightRef = useRef<HemisphereLight>(null)
  const showPerf = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf')
  const {
    objects, screenW, screenH, isPaused,
    bgColor, rainIntensity, showGrid, gridLineWidth,
    hemSkyColor, hemGroundColor, hemIntensity,
    sunColor, sunIntensity, sunAzimuth, sunElevation,
    fogEnabled, fogColor, fogDensity,
    shadowMode, shadowRadius, aoRadius, aoIntensity, blobSize, blobOpacity,
    windSpeed, windStrength,
    fowColor, fowDisplayOpacity,
    embersIntensity, dustIntensity, snowIntensity, mistIntensity, firefliesIntensity, ashIntensity, lightningIntensity,
    candleIntensity, candleColor, placedCandles,
    bakedGround, mapImages,
    isConnected,
    scatterSeed, scatterEnabled, scatterDensityScale, scatterErasedIndices, baseTexture,
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

  const sunDist = fieldSize
  const shadowHalf = fieldSize / 2

  return (
    <div style={{ width: '100%', height: '100%', background: bgColor, position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [0, initH, 0.001], fov: DEFAULT_FOV, near: 0.1, far: 300 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <color attach="background" args={[bgColor]} />
        {fogEnabled && <fogExp2 attach="fog" args={[fogColor, fogDensity]} />}

        {/* color/intensity/position owned by SceneTweener — no reactive props here */}
        <hemisphereLight ref={hemLightRef} />
        <directionalLight
          ref={lightRef}
          castShadow={useSoftShadows}
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

        <CameraController screenH={screenH} />
        <SceneTweener
          hemLightRef={hemLightRef} sunLightRef={lightRef}
          hemSkyColor={hemSkyColor} hemGroundColor={hemGroundColor} hemIntensity={hemIntensity}
          sunColor={sunColor} sunIntensity={sunIntensity}
          sunAzimuth={sunAzimuth} sunElevation={sunElevation} sunDist={sunDist}
          fogEnabled={fogEnabled} fogColor={fogColor} fogDensity={fogDensity}
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
                baseTexture={baseTexture}
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
            seed={scatterSeed}
            enabled={scatterEnabled}
            densityScale={scatterDensityScale}
            erasedIndices={scatterErasedIndices}
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
            lineWidth={gridLineWidth}
          />
          <PlacedObjectsRenderer
            objects={objects}
            showBlobs={showBlobs}
            blobSize={blobSize}
            blobOpacity={blobOpacity}
            castShadow={useSoftShadows}
          />
          <MapImages images={mapImages} />
          <PlacedCandleLights candles={placedCandles} showIndicators={false} />
        </Suspense>

        <Rain intensity={rainIntensity} fieldSize={fieldSize} />
        <AmbientEffects
          fieldSize={fieldSize}
          hemSkyColor={hemSkyColor}
          hemGroundColor={hemGroundColor}
          embers={embersIntensity}
          dust={dustIntensity}
          snow={snowIntensity}
          mist={mistIntensity}
          fireflies={firefliesIntensity}
          ash={ashIntensity}
          lightning={lightningIntensity}
          candle={candleIntensity}
          candleColor={candleColor}
        />

        {showPerf && <PerfSampler />}

        {useSSAO && (
          <EffectComposer>
            <N8AO color="black" aoRadius={aoRadius} intensity={aoIntensity} aoSamples={16} quality="medium" />
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>
      {showPerf && <PerformanceOverlay />}
      {isPaused && (
        <div style={{
          position: 'absolute', inset: 0, background: '#000', zIndex: 10,
        }} />
      )}
      {!isConnected && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.35)',
          fontFamily: '"SF Mono", Consolas, monospace',
          fontSize: '13px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          userSelect: 'none',
        }}>
          Waiting for GM
        </div>
      )}
      <SceneSounds rain={rainIntensity} lightning={lightningIntensity} />
    </div>
  )
}
