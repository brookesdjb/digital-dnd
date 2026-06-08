'use client'

// Display (TV/iPad) scene — read-only, driven by Supabase Realtime via useSceneSync.

import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Rain } from './Rain'
import { Scatter } from './Scatter'
import { Ground, ROAD_TEXTURE_LABELS } from './Ground'
import type { GroundIO } from './Ground'
import { BattleGrid } from './BattleGrid'
import { PlacedObjectsRenderer } from './PlacedObjectsRenderer'
import { useSceneSync } from '@/lib/sync/useSceneSync'

const DEFAULT_FOV = 45

interface DisplaySceneProps {
  tableId: string
}

export default function DisplayScene({ tableId }: DisplaySceneProps) {
  const groundIO = useRef<GroundIO>(undefined)
  const { objects, screenW, screenH, bgColor, weather } = useSceneSync(tableId, groundIO)

  const fieldSize = Math.ceil(Math.max(screenW, screenH)) + 8
  const initH     = screenH / (2 * Math.tan((DEFAULT_FOV * Math.PI / 180) / 2))

  return (
    <div style={{ width: '100%', height: '100%', background: bgColor }}>
      <Canvas
        camera={{ position: [0, initH, 0.001], fov: DEFAULT_FOV, near: 0.1, far: 300 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <color attach="background" args={[bgColor]} />

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
            ioRef={groundIO}
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
            screenW={screenW}
            screenH={screenH}
            visible={false}
            showBorder={true}
          />
          <PlacedObjectsRenderer objects={objects} showBlobs={true} />
        </Suspense>

        <Rain intensity={weather === 'rain' ? 1.0 : 0} fieldSize={fieldSize} />
      </Canvas>
    </div>
  )
}
