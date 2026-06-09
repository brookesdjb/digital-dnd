'use client'

import { Suspense, useRef, useEffect, useCallback, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Rain } from './Rain'
import { Scatter } from './Scatter'
import { Ground } from './Ground'
import type { GroundIO } from './Ground'
import { BattleGrid, SCREEN_SIZES, SCREEN_SIZE_LABELS } from './BattleGrid'
import { ObjectPainter } from './ObjectPainter'
import type { ObjectsIO } from './ObjectPainter'
import { FogLayer } from './FogLayer'
import type { FogIO } from './FogLayer'
import { useSceneDB } from '@/lib/sync/useSceneDB'
import { useScenePublish } from '@/lib/sync/useScenePublish'
import { useCockpit } from '@/components/cockpit/useCockpit'
import { CockpitOverlay } from '@/components/cockpit/CockpitOverlay'

const DEFAULT_FOV = 45

interface CameraControllerProps {
  screenH:     number
  fov:         number
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}

function CameraController({ screenH, fov, controlsRef }: CameraControllerProps) {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera
  useEffect(() => {
    const h = screenH / (2 * Math.tan((fov * Math.PI / 180) / 2))
    camera.fov = fov
    camera.position.set(0, h, 0.001)
    camera.updateProjectionMatrix()
    if (controlsRef?.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }, [camera, screenH, fov, controlsRef])
  return null
}

interface ControlSceneProps { tableId: string }

export default function ControlScene({ tableId }: ControlSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const groundIO    = useRef<GroundIO>(undefined)
  const objectsIO   = useRef<ObjectsIO>(undefined)
  const fogIO       = useRef<FogIO>(undefined)
  const lightRef    = useRef<THREE.DirectionalLight>(null)

  const c = useCockpit()

  // Save timestamp for the "Saved X ago" chip
  const [savedAt, setSavedAt] = useState(Date.now() - 42000)
  const [savedFlash, setSavedFlash] = useState(false)

  const {
    save: dbSave, scheduleSave, sceneIdRef, setBgColor,
    screenW: dbScreenW, screenH: dbScreenH,
    scenes, activeSceneId, switchScene, createScene, deleteScene, renameScene,
  } = useSceneDB(tableId, groundIO, objectsIO, fogIO)

  const {
    schedulePublishTerrain, schedulePublishObjects, schedulePublishState,
    schedulePublishFog, publishSceneActivate,
  } = useScenePublish(tableId, sceneIdRef, groundIO, objectsIO, fogIO)

  const handleSave = useCallback(() => {
    dbSave()
    setSavedAt(Date.now())
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1400)
  }, [dbSave])

  const handleSwitchScene = useCallback(async (id: string) => {
    await switchScene(id)
    publishSceneActivate(id)
  }, [switchScene, publishSceneActivate])

  const onTerrainChange = useCallback(() => { schedulePublishTerrain(); scheduleSave() }, [schedulePublishTerrain, scheduleSave])
  const onObjectsChange = useCallback(() => { schedulePublishObjects(); scheduleSave() }, [schedulePublishObjects, scheduleSave])
  const onFogChange     = useCallback(() => { schedulePublishFog();    scheduleSave() }, [schedulePublishFog,    scheduleSave])

  // Keep DB bgColor ref in sync
  useEffect(() => { setBgColor(c.light.bgColor) }, [c.light.bgColor, setBgColor])

  // Broadcast state changes to display
  useEffect(() => {
    schedulePublishState({
      showGrid:      c.view.grid,
      rainIntensity: c.weather.rain,
      bgColor:       c.light.bgColor,
      hemSkyColor:   c.light.hemSkyColor,
      hemGroundColor: c.light.hemGroundColor,
      hemIntensity:  c.light.hemIntensity,
      sunColor:      c.light.sunColor,
      sunIntensity:  c.light.sunIntensity,
      sunAzimuth:    c.light.azimuth,
      sunElevation:  c.light.elevation,
      fogEnabled:    c.light.fogEnabled,
      fogColor:      c.light.fogColor,
      fogDensity:    c.light.fogDensity,
      shadowMode:    c.shadows.mode,
      shadowRadius:  c.shadows.radius,
      aoRadius:      c.shadows.aoRadius,
      aoIntensity:   c.shadows.aoIntensity,
      blobSize:      c.shadows.blobSize,
      blobOpacity:   c.shadows.blobOpacity,
      windSpeed:     c.grass.windSpeed,
      windStrength:  c.grass.windStrength,
      fowColor:      c.fog.color,
      fowDisplayOpacity: c.fog.playerOpacity,
    })
  }, [
    c.view.grid, c.weather.rain, c.light, c.shadows, c.grass,
    c.fog.color, c.fog.playerOpacity, schedulePublishState,
  ])

  // Shadow baking
  const objectPaintMode = c.tool === 'object'
  const useSoftShadows  = c.shadows.mode === 'Soft Shadows' || c.shadows.mode === 'Soft Shadows + SSAO'

  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    if (objectPaintMode) {
      light.shadow.autoUpdate = true
    } else {
      light.shadow.autoUpdate = false
      light.shadow.needsUpdate = true
    }
  }, [objectPaintMode])

  useEffect(() => {
    const light = lightRef.current
    if (!light || !useSoftShadows) return
    light.shadow.needsUpdate = true
  }, [c.light.azimuth, c.light.elevation, useSoftShadows])

  // Derived values
  const screenDims = SCREEN_SIZES[c.view.screenSize] ?? SCREEN_SIZES[SCREEN_SIZE_LABELS[0]]
  const fieldSize  = Math.ceil(Math.max(dbScreenW, dbScreenH)) + 8

  const useSSAO   = c.shadows.mode === 'SSAO' || c.shadows.mode === 'Soft Shadows + SSAO'
  const showBlobs = c.shadows.mode === 'Blob'

  const initH = SCREEN_SIZES[SCREEN_SIZE_LABELS[0]].h / (2 * Math.tan((DEFAULT_FOV * Math.PI / 180) / 2))

  const az  = c.light.azimuth   * Math.PI / 180
  const el  = c.light.elevation * Math.PI / 180
  const sunDist = fieldSize
  const sunPos: [number, number, number] = [
    Math.cos(el) * Math.sin(az) * sunDist,
    Math.sin(el) * sunDist,
    Math.cos(el) * Math.cos(az) * sunDist,
  ]
  const shadowHalf = fieldSize / 2

  const fogPaintMode = c.tool === 'fog'
  const fogEraseMode = c.fog.mode === 'reveal' || c.fog.mode === 'erase'
  const paintMode    = c.tool === 'road'

  const painting = paintMode || objectPaintMode || fogPaintMode
  const cursor   = painting ? 'none' : 'auto'

  return (
    <div style={{ width: '100%', height: '100%', background: c.light.bgColor, cursor }}>
      <Canvas
        shadows
        camera={{ position: [0, initH, 0.001], fov: DEFAULT_FOV, near: 0.1, far: 300 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <CameraController screenH={screenDims.h} fov={c.view.fov} controlsRef={controlsRef} />

        <color attach="background" args={[c.light.bgColor]} />
        {c.light.fogEnabled && <fogExp2 attach="fog" args={[c.light.fogColor, c.light.fogDensity]} />}

        <hemisphereLight color={c.light.hemSkyColor} groundColor={c.light.hemGroundColor} intensity={c.light.hemIntensity} />

        <directionalLight
          ref={lightRef}
          castShadow={useSoftShadows}
          position={sunPos}
          color={c.light.sunColor}
          intensity={c.light.sunIntensity}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-shadowHalf}
          shadow-camera-right={shadowHalf}
          shadow-camera-top={shadowHalf}
          shadow-camera-bottom={-shadowHalf}
          shadow-camera-near={1}
          shadow-camera-far={sunDist * 2}
          shadow-bias={-0.001}
          shadow-radius={c.shadows.radius}
        />

        <Suspense fallback={null}>
          <Ground
            receiveShadow={useSoftShadows}
            paintMode={paintMode}
            brushRadius={c.road.brush}
            brushOpacity={c.road.opacity}
            eraseMode={c.road.erase}
            selectedTexture={c.road.texture}
            ioRef={groundIO}
            onChange={onTerrainChange}
          />
          <Scatter
            windSpeed={c.grass.windSpeed}
            windStrength={c.grass.windStrength}
            showBlobs={showBlobs}
            usePCSS={useSoftShadows}
            blobSize={c.shadows.blobSize}
            blobOpacity={c.shadows.blobOpacity}
            fieldSize={fieldSize}
          />
          <FogLayer
            paintMode={fogPaintMode}
            eraseMode={fogEraseMode}
            tool={c.fog.tool}
            brushRadius={c.fog.brushRadius}
            fogColor={c.fog.color}
            opacity={c.fog.dmOpacity}
            ioRef={fogIO}
            onChange={onFogChange}
          />
          <BattleGrid screenW={screenDims.w} screenH={screenDims.h} visible={c.view.grid} showBorder={c.view.border} />
          <ObjectPainter
            objectPaintMode={objectPaintMode}
            selectedModel={c.object.model}
            objectScale={c.object.scale}
            brushSize={c.object.brush}
            density={c.object.density}
            randomRotation={c.object.randomY}
            snapToGrid={c.object.snapToGrid}
            ioRef={objectsIO}
            castShadow={useSoftShadows}
            showBlobs={showBlobs}
            blobSize={c.shadows.blobSize}
            blobOpacity={c.shadows.blobOpacity}
            onChange={onObjectsChange}
          />
        </Suspense>

        <Rain intensity={c.weather.rain} fieldSize={fieldSize} />

        {useSSAO && (
          <EffectComposer>
            <N8AO color="black" aoRadius={c.shadows.aoRadius} intensity={c.shadows.aoIntensity} aoSamples={16} quality="medium" />
            <SMAA />
          </EffectComposer>
        )}

        <OrbitControls
          ref={controlsRef}
          enabled={!painting}
          target={[0, 0, 0]}
          minPolarAngle={0}
          maxPolarAngle={0}
          minDistance={4}
          maxDistance={300}
          enablePan
          panSpeed={0.6}
          dampingFactor={0.08}
          enableDamping
          enableRotate={false}
        />
      </Canvas>

      <CockpitOverlay
        c={c}
        savedAt={savedAt}
        actions={{
          scenes,
          activeSceneId,
          savedFlash,
          onSave:        handleSave,
          onSwitchScene: handleSwitchScene,
          onCreateScene: createScene,
          onDeleteScene: deleteScene,
          onRenameScene: renameScene,
          onFogCoverAll:     () => { fogIO.current?.fill?.();  onFogChange() },
          onFogClearAll:     () => { fogIO.current?.clear?.(); onFogChange() },
          onObjectsUndo:     () => { objectsIO.current?.undo?.();     onObjectsChange() },
          onObjectsClearAll: () => { objectsIO.current?.clearAll?.(); onObjectsChange() },
          onRecenter: () => {
            if (controlsRef.current) {
              controlsRef.current.target.set(0, 0, 0)
              controlsRef.current.update()
            }
          },
        }}
      />
    </div>
  )
}
