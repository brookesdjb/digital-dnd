'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

const GROUND_SIZE = 80

interface BakedGroundProps {
  dataUrl: string
}

export function BakedGround({ dataUrl }: BakedGroundProps) {
  const texture = useMemo(() => new THREE.TextureLoader().load(dataUrl), [dataUrl])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      {/* Lighting is baked into the JPEG — MeshBasicMaterial shows it as-is. */}
      <meshBasicMaterial map={texture} />
    </mesh>
  )
}
