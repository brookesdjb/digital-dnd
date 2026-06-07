import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import { useControls } from 'leva'
import * as THREE from 'three'
import { Rain } from './Rain'
import { Scatter } from './Scatter'
import { Ground, ROAD_TEXTURE_LABELS } from './Ground'

export default function App() {
  const { windSpeed, windStrength } = useControls('Grass', {
    windSpeed:    { value: 1.2, min: 0, max: 5,   step: 0.1 },
    windStrength: { value: 1.0, min: 0, max: 3,   step: 0.1 },
  })
  const { rainIntensity } = useControls('Weather', {
    rainIntensity: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'Rain' },
  })
  const { paintMode, brushRadius, eraseMode, selectedTexture } = useControls('Road Painting', {
    paintMode:       { value: false,                  label: 'Paint Roads' },
    eraseMode:       { value: false,                  label: 'Erase'       },
    selectedTexture: { value: ROAD_TEXTURE_LABELS[0], options: ROAD_TEXTURE_LABELS, label: 'Texture' },
    brushRadius:     { value: 3, min: 0.5, max: 12, step: 0.25, label: 'Brush Size' },
  })
  const { shadowMode, shadowRadius, aoRadius, aoIntensity, blobSize, blobOpacity } = useControls('Shadows', {
    shadowMode:   { value: 'Blob', options: ['Blob', 'Soft Shadows', 'SSAO', 'Soft Shadows + SSAO'], label: 'Mode' },
    shadowRadius: { value: 8,    min: 1,   max: 30,  step: 1,    label: 'Shadow Softness' },
    aoRadius:     { value: 1.5,  min: 0.1, max: 5,   step: 0.1,  label: 'AO Radius'       },
    aoIntensity:  { value: 5.0,  min: 0,   max: 20,  step: 0.5,  label: 'AO Intensity'    },
    blobSize:     { value: 1.0,  min: 0.1, max: 3.0, step: 0.05, label: 'Blob Size'       },
    blobOpacity:  { value: 1.0,  min: 0,   max: 1,   step: 0.05, label: 'Blob Opacity'    },
  })

  const useSoftShadows = shadowMode === 'Soft Shadows' || shadowMode === 'Soft Shadows + SSAO'
  const useSSAO        = shadowMode === 'SSAO'         || shadowMode === 'Soft Shadows + SSAO'
  const showBlobs      = shadowMode === 'Blob'

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#8fafb8', cursor: paintMode ? 'none' : 'auto' }}>
      {/* shadows prop on Canvas means shadowMap.enabled=true from the very first frame,
          so every material compiles with USE_SHADOWMAP — no runtime recompile needed.
          The directional light's castShadow flag controls whether shadows actually render. */}
      <Canvas
        shadows
        camera={{ position: [0, 24, 6], fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      >
        {useSoftShadows && (
          <directionalLight
            castShadow
            position={[12, 25, 8]}
            intensity={1.2}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-22}
            shadow-camera-right={22}
            shadow-camera-top={22}
            shadow-camera-bottom={-22}
            shadow-camera-near={1}
            shadow-camera-far={60}
            shadow-bias={-0.001}
            shadow-radius={shadowRadius}
          />
        )}

        <Environment files="/textures/grasslands_sunset_2k.hdr" background />

        <Suspense fallback={null}>
          <Ground
              receiveShadow={useSoftShadows}
              paintMode={paintMode}
              brushRadius={brushRadius}
              eraseMode={eraseMode}
              selectedTexture={selectedTexture}
            />
          <Scatter
            windSpeed={windSpeed}
            windStrength={windStrength}
            showBlobs={showBlobs}
            usePCSS={useSoftShadows}
            blobSize={blobSize}
            blobOpacity={blobOpacity}
          />
        </Suspense>

        <Rain intensity={rainIntensity} />

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
          enabled={!paintMode}
          target={[0, 0, 0]}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.4}
          minDistance={8}
          maxDistance={45}
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
