import { Suspense, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import { useControls, button } from 'leva'
import * as THREE from 'three'
import { Rain } from './Rain'
import { Scatter } from './Scatter'
import { Ground, ROAD_TEXTURE_LABELS } from './Ground'
import { BattleGrid, SCREEN_SIZES, SCREEN_SIZE_LABELS } from './BattleGrid'
import { ObjectPainter } from './ObjectPainter'

const DEFAULT_FOV = 45

function CameraController({ screenH, fov, controlsRef }) {
  const camera = useThree(s => s.camera)
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

async function saveScene(groundIO, objectsIO) {
  const layers  = await groundIO.current?.save()
  const objects = objectsIO.current?.save() ?? []
  const json = JSON.stringify({ version: 2, textures: ROAD_TEXTURE_LABELS, layers, objects }, null, 2)
  const url  = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  Object.assign(document.createElement('a'), { href: url, download: 'terrain-map.json' }).click()
  URL.revokeObjectURL(url)
}

function loadScene(groundIO, objectsIO) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'; input.style.display = 'none'
  document.body.appendChild(input)
  input.onchange = async e => {
    document.body.removeChild(input)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (data.layers) await groundIO.current?.load(data.layers)
      if (data.objects) objectsIO.current?.load(data.objects)
    } catch (err) { console.error('Failed to load scene:', err) }
  }
  input.click()
}

export default function App() {
  const controlsRef = useRef()
  const groundIO    = useRef()
  const objectsIO   = useRef()

  const { windSpeed, windStrength } = useControls('Grass', {
    windSpeed:    { value: 1.2, min: 0, max: 5, step: 0.1 },
    windStrength: { value: 1.0, min: 0, max: 3, step: 0.1 },
  })
  const { rainIntensity } = useControls('Weather', {
    rainIntensity: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'Rain' },
  })
  const { objectPaintMode } = useControls('Object Painting', {
    objectPaintMode: { value: false, label: 'Paint Objects' },
  })
  useControls('Scene', {
    'Save Scene': button(() => saveScene(groundIO, objectsIO)),
    'Load Scene': button(() => loadScene(groundIO, objectsIO)),
  })
  const { paintMode, brushRadius, brushOpacity, eraseMode, selectedTexture } = useControls('Road Painting', {
    paintMode:       { value: false,                  label: 'Paint Roads'  },
    eraseMode:       { value: false,                  label: 'Erase'        },
    selectedTexture: { value: ROAD_TEXTURE_LABELS[0], options: ROAD_TEXTURE_LABELS, label: 'Texture' },
    brushRadius:     { value: 3,   min: 0.5, max: 12, step: 0.25, label: 'Brush Size'    },
    brushOpacity:    { value: 1.0, min: 0.1, max: 1,  step: 0.05, label: 'Brush Opacity' },
  })
  const { shadowMode, shadowRadius, aoRadius, aoIntensity, blobSize, blobOpacity } = useControls('Shadows', {
    shadowMode:   { value: 'Blob', options: ['Blob', 'Soft Shadows', 'SSAO', 'Soft Shadows + SSAO'], label: 'Mode' },
    shadowRadius: { value: 8,    min: 1,   max: 30,  step: 1,    label: 'Shadow Softness' },
    aoRadius:     { value: 1.5,  min: 0.1, max: 5,   step: 0.1,  label: 'AO Radius'       },
    aoIntensity:  { value: 5.0,  min: 0,   max: 20,  step: 0.5,  label: 'AO Intensity'    },
    blobSize:     { value: 1.0,  min: 0.1, max: 3.0, step: 0.05, label: 'Blob Size'       },
    blobOpacity:  { value: 1.0,  min: 0,   max: 1,   step: 0.05, label: 'Blob Opacity'    },
  })
  const { screenSize, showGrid, showBorder, fov } = useControls('View', {
    screenSize: { value: '55"', options: SCREEN_SIZE_LABELS, label: 'Screen Size' },
    fov:        { value: DEFAULT_FOV, min: 16, max: 60, step: 1, label: 'FOV' },
    showGrid:   { value: false, label: 'Show Grid'   },
    showBorder: { value: true,  label: 'Show Border' },
    reCenter: button(() => {
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0)
        controlsRef.current.update()
      }
    }, { label: 'Re-center' }),
  })
  const {
    bgColor,
    hemSkyColor, hemGroundColor, hemIntensity,
    sunColor, sunIntensity, sunAzimuth, sunElevation,
    fogEnabled, fogColor, fogDensity,
  } = useControls('Lighting', {
    bgColor:        { value: '#6a8fa8', label: 'Sky Color'      },
    hemSkyColor:    { value: '#87ceeb', label: 'Ambient Sky'    },
    hemGroundColor: { value: '#3d5a1e', label: 'Ambient Ground' },
    hemIntensity:   { value: 1.5, min: 0, max: 4,   step: 0.1, label: 'Ambient Intensity' },
    sunColor:       { value: '#fff4e0', label: 'Sun Color'      },
    sunIntensity:   { value: 1.8, min: 0, max: 6,   step: 0.1, label: 'Sun Intensity'     },
    sunAzimuth:     { value: 45,  min: 0, max: 360, step: 1,   label: 'Sun Azimuth'       },
    sunElevation:   { value: 55,  min: 5, max: 90,  step: 1,   label: 'Sun Elevation'     },
    fogEnabled:     { value: false, label: 'Fog' },
    fogColor:       { value: '#adc4d4', label: 'Fog Color'   },
    fogDensity:     { value: 0.012, min: 0, max: 0.06, step: 0.001, label: 'Fog Density' },
  })

  const screenDims = SCREEN_SIZES[screenSize]
  const fieldSize  = Math.ceil(Math.max(screenDims.w, screenDims.h)) + 8

  const useSoftShadows = shadowMode === 'Soft Shadows' || shadowMode === 'Soft Shadows + SSAO'
  const useSSAO        = shadowMode === 'SSAO'         || shadowMode === 'Soft Shadows + SSAO'
  const showBlobs      = shadowMode === 'Blob'

  const initH = SCREEN_SIZES['55"'].h / (2 * Math.tan((DEFAULT_FOV * Math.PI / 180) / 2))

  // Convert azimuth + elevation to a directional light position
  const az = sunAzimuth  * Math.PI / 180
  const el = sunElevation * Math.PI / 180
  const sunDist = fieldSize
  const sunPos = [
    Math.cos(el) * Math.sin(az) * sunDist,
    Math.sin(el) * sunDist,
    Math.cos(el) * Math.cos(az) * sunDist,
  ]
  const shadowHalf = fieldSize / 2

  return (
    <div style={{ width: '100vw', height: '100vh', background: bgColor, cursor: (paintMode || objectPaintMode) ? 'none' : 'auto' }}>
      <Canvas
        shadows
        camera={{ position: [0, initH, 0.001], fov: DEFAULT_FOV, near: 0.1, far: 300 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <CameraController screenH={screenDims.h} fov={fov} controlsRef={controlsRef} />

        {/* Scene background and optional fog */}
        <color attach="background" args={[bgColor]} />
        {fogEnabled && <fogExp2 attach="fog" args={[fogColor, fogDensity]} />}

        {/* Hemisphere ambient — sky/ground color split */}
        <hemisphereLight
          color={hemSkyColor}
          groundColor={hemGroundColor}
          intensity={hemIntensity}
        />

        {/* Sun — always provides illumination, casts shadows in soft shadow mode */}
        <directionalLight
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
          <Ground
            receiveShadow={useSoftShadows}
            paintMode={paintMode}
            brushRadius={brushRadius}
            brushOpacity={brushOpacity}
            eraseMode={eraseMode}
            selectedTexture={selectedTexture}
            ioRef={groundIO}
          />
          <Scatter
            windSpeed={windSpeed}
            windStrength={windStrength}
            showBlobs={showBlobs}
            usePCSS={useSoftShadows}
            blobSize={blobSize}
            blobOpacity={blobOpacity}
            fieldSize={fieldSize}
          />
          <BattleGrid screenW={screenDims.w} screenH={screenDims.h} visible={showGrid} showBorder={showBorder} />
          <ObjectPainter
            objectPaintMode={objectPaintMode}
            ioRef={objectsIO}
            castShadow={useSoftShadows}
            showBlobs={showBlobs}
            blobSize={blobSize}
            blobOpacity={blobOpacity}
          />
        </Suspense>

        <Rain intensity={rainIntensity} fieldSize={fieldSize} />

        {useSSAO && (
          <EffectComposer>
            <N8AO
              color="black"
              aoRadius={aoRadius}
              intensity={aoIntensity}
              aoSamples={16}
              quality="medium"
            />
            <SMAA />
          </EffectComposer>
        )}

        <OrbitControls
          ref={controlsRef}
          enabled={!paintMode && !objectPaintMode}
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
    </div>
  )
}
