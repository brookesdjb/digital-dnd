'use client'

// Display (TV) scene — read-only. No leva panels, no pointer events, no OrbitControls.
// M1: renders with static defaults. M3: wire in useSceneSync(tableId) for live state.

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Rain } from './Rain'
import { Scatter } from './Scatter'
import { Ground, ROAD_TEXTURE_LABELS } from './Ground'
import { BattleGrid, SCREEN_SIZES } from './BattleGrid'
// ObjectPainter not used in display mode (it has leva controls).
// M3: replace with a read-only PlacedObjectsRenderer driven by useSceneSync.

const DEFAULT_FOV   = 45
const DEFAULT_SCREEN = '55"'

interface DisplaySceneProps {
  tableId: string
}

export default function DisplayScene({ tableId: _tableId }: DisplaySceneProps) {
  // M3: replace with const scene = useSceneSync(tableId)
  const screenDims = SCREEN_SIZES[DEFAULT_SCREEN]
  const fieldSize  = Math.ceil(Math.max(screenDims.w, screenDims.h)) + 8
  const initH      = screenDims.h / (2 * Math.tan((DEFAULT_FOV * Math.PI / 180) / 2))

  return (
    <Canvas
      camera={{ position: [0, initH, 0.001], fov: DEFAULT_FOV, near: 0.1, far: 300 }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
    >
      <color attach="background" args={['#6a8fa8']} />

      <hemisphereLight color="#87ceeb" groundColor="#3d5a1e" intensity={1.5} />
      <directionalLight
        position={[20, 30, 20]}
        color="#fff4e0"
        intensity={1.8}
        castShadow={false}
      />

      <Suspense fallback={null}>
        <Ground
          receiveShadow={false}
          paintMode={false}
          brushRadius={3}
          brushOpacity={1}
          eraseMode={false}
          selectedTexture={ROAD_TEXTURE_LABELS[0]}
        />
        <Scatter
          windSpeed={1.2}
          windStrength={1.0}
          showBlobs={true}
          blobSize={1.0}
          blobOpacity={1.0}
          fieldSize={fieldSize}
        />
        <BattleGrid
          screenW={screenDims.w}
          screenH={screenDims.h}
          visible={false}
          showBorder={true}
        />
      </Suspense>

      <Rain intensity={0} fieldSize={fieldSize} />
    </Canvas>
  )
}
