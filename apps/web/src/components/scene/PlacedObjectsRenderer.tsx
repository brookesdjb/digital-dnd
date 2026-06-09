'use client'

import { Suspense, useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { PlacedObject } from '@dnd-table/types'
import { BLOB_GEO, BLOB_MAT, SHADOW_SCALE, MAX_PLACED, InstancedPlacedAsset } from './ObjectPainter'

interface Props {
  objects: PlacedObject[]
  showBlobs?: boolean
  blobSize?: number
  blobOpacity?: number
  castShadow?: boolean
}

export function PlacedObjectsRenderer({ objects, showBlobs = true, blobSize = 1.0, blobOpacity = 1.0, castShadow = false }: Props) {
  const blobRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => { BLOB_MAT.opacity = blobOpacity }, [blobOpacity])

  useEffect(() => {
    const mesh = blobRef.current
    if (!mesh || !showBlobs) return
    const dummy = new THREE.Object3D()
    objects.forEach((item, i) => {
      dummy.position.set(item.x, 0.02, item.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      const scale = item.scale * (SHADOW_SCALE[item.shadowType] ?? 1.0) * blobSize
      dummy.scale.set(scale, scale, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = objects.length
  }, [objects, showBlobs, blobSize])

  const grouped = Object.entries(
    objects.reduce<Record<string, PlacedObject[]>>((acc, o) => {
      ;(acc[o.path] ??= []).push(o)
      return acc
    }, {})
  )

  return (
    <>
      <instancedMesh
        ref={blobRef}
        renderOrder={1}
        args={[BLOB_GEO, BLOB_MAT, MAX_PLACED]}
        visible={showBlobs && objects.length > 0}
      />
      {grouped.map(([path, list]) => (
        <Suspense key={path} fallback={null}>
          <InstancedPlacedAsset path={path} instances={list} castShadow={castShadow} />
        </Suspense>
      ))}
    </>
  )
}
