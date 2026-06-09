'use client'

import { useRef, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useLoader } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { createClient } from '@/lib/supabase/client'
import type { PlacedImage } from '@dnd-table/types'

const GROUND_SIZE = 80

// ── Edge-blending shader ──────────────────────────────────────────────────────
// Fades alpha to 0 at image edges and draws a selection highlight.

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float edgeFade;
  uniform float isSelected;
  varying vec2 vUv;

  void main() {
    vec4 col = texture2D(map, vUv);

    // Smooth edge fade — independent on X and Y, combined multiplicatively
    float f = max(edgeFade, 0.001);
    float ax = smoothstep(0.0, f, vUv.x) * smoothstep(0.0, f, 1.0 - vUv.x);
    float ay = smoothstep(0.0, f, vUv.y) * smoothstep(0.0, f, 1.0 - vUv.y);
    float alpha = ax * ay;

    // Amber selection border (1.5% inset from each edge)
    float bd = 0.015;
    float border = isSelected * (1.0 - step(bd, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y))));

    vec3 finalColor = mix(col.rgb, vec3(1.0, 0.72, 0.08), border * 0.85);
    float finalAlpha = mix(col.a * alpha, 1.0, border * 0.8);

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`

// ── Per-image mesh ─────────────────────────────────────────────────────────────
// Loaded inside <Suspense> — each image is independent, shows fallback while loading.

interface PlacedImageMeshProps {
  img: PlacedImage
  isSelected: boolean
  onMeshReady: (id: string, mesh: THREE.Mesh) => void
  onMeshCleanup: (id: string) => void
}

function PlacedImageMesh({ img, isSelected, onMeshReady, onMeshCleanup }: PlacedImageMeshProps) {
  const supabase = useMemo(() => createClient(), [])
  const url = useMemo(
    () => supabase.storage.from('map-assets').getPublicUrl(img.storageKey).data.publicUrl,
    [supabase, img.storageKey],
  )

  const texture = useLoader(THREE.TextureLoader, url)

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      map:        { value: null },
      edgeFade:   { value: img.edgeFade },
      isSelected: { value: 0.0 },
    },
    vertexShader:   VERT,
    fragmentShader: FRAG,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  // Created once — texture + uniforms updated imperatively below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useEffect(() => { material.uniforms.map.value = texture }, [material, texture])
  useEffect(() => { material.uniforms.edgeFade.value = img.edgeFade }, [material, img.edgeFade])
  useEffect(() => { material.uniforms.isSelected.value = isSelected ? 1.0 : 0.0 }, [material, isSelected])
  useEffect(() => () => { material.dispose() }, [material])

  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (meshRef.current) onMeshReady(img.id, meshRef.current)
    return () => onMeshCleanup(img.id)
  // Stable callbacks — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img.id])

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, img.rotation * Math.PI / 180]}
      position={[img.x, 0.002, img.z]}
      renderOrder={-0.5}
    >
      <planeGeometry args={[img.widthIn, img.heightIn]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export interface MapImagesProps {
  images: PlacedImage[]
  imageMode?: boolean
  selectedImageId?: string | null
  onSelect?: (id: string | null) => void
  // Called with final x,z when drag ends — single state update, not per-frame.
  onMove?: (id: string, x: number, z: number) => void
  onChange?: () => void
}

export function MapImages({ images, imageMode, selectedImageId, onSelect, onMove, onChange }: MapImagesProps) {
  // Imperative refs — no React re-renders during drag.
  const meshMap   = useRef<Map<string, THREE.Mesh>>(new Map())
  const dragState = useRef<{ id: string; x: number; z: number } | null>(null)
  const dragOff   = useRef({ x: 0, z: 0 })

  const onMeshReady   = useCallback((id: string, mesh: THREE.Mesh) => { meshMap.current.set(id, mesh) }, [])
  const onMeshCleanup = useCallback((id: string) => { meshMap.current.delete(id) }, [])

  // Move the dragged mesh each frame — zero React re-renders during drag.
  useFrame(() => {
    if (!dragState.current) return
    const mesh = meshMap.current.get(dragState.current.id)
    if (mesh) {
      mesh.position.x = dragState.current.x
      mesh.position.z = dragState.current.z
    }
  })

  // Drag end: commit position to React state once.
  useEffect(() => {
    const stop = () => {
      if (!dragState.current) return
      onMove?.(dragState.current.id, dragState.current.x, dragState.current.z)
      dragState.current = null
      onChange?.()
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [onMove, onChange])

  // Hit test: check if world point (cx, cz) is inside the image's rotated bounding box.
  // Rotated bounding box: project worldDelta onto the image's width/height axes.
  // With Three.js Euler 'XYZ' rotation [-PI/2, 0, angle] (Rz first, then Rx lays flat):
  //   width-axis  = (cos(angle), 0, -sin(angle))
  //   height-axis = (-sin(angle), 0, -cos(angle))
  const hitTest = useCallback((cx: number, cz: number): PlacedImage | null => {
    for (const img of [...images].reverse()) {
      const rad = img.rotation * Math.PI / 180
      const dx = cx - img.x, dz = cz - img.z
      const localW = dx * Math.cos(rad) - dz * Math.sin(rad)
      const localH = dx * Math.sin(rad) + dz * Math.cos(rad)
      if (Math.abs(localW) <= img.widthIn / 2 && Math.abs(localH) <= img.heightIn / 2) return img
    }
    return null
  }, [images])

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!imageMode) return
    e.stopPropagation()
    const hit = hitTest(e.point.x, e.point.z)
    if (hit) {
      onSelect?.(hit.id)
      dragState.current = { id: hit.id, x: hit.x, z: hit.z }
      dragOff.current   = { x: hit.x - e.point.x, z: hit.z - e.point.z }
    } else {
      onSelect?.(null)
    }
  }, [imageMode, hitTest, onSelect])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragState.current) return
    dragState.current.x = e.point.x + dragOff.current.x
    dragState.current.z = e.point.z + dragOff.current.z
  }, [])

  return (
    <>
      {images.map(img => (
        <Suspense key={img.id} fallback={null}>
          <PlacedImageMesh
            img={img}
            isSelected={!!imageMode && img.id === selectedImageId}
            onMeshReady={onMeshReady}
            onMeshCleanup={onMeshCleanup}
          />
        </Suspense>
      ))}

      {/* Hit plane — active only in image mode. Sits above image meshes (y=0.005)
          but below the Ground hit mesh (y=0.01); Ground's handler returns early
          when not in paintMode, so events propagate down here. */}
      {imageMode && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.005, 0]}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
