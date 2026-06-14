'use client'

import { useRef, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useLoader } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { createClient } from '@/lib/supabase/client'
import type { PlacedImage } from '@dnd-table/types'

const GROUND_SIZE = 80

// ── Edge-fade + selection injected into a lit material ─────────────────────────
// Images use MeshLambertMaterial so they pick up the scene's hemisphere/sun light
// (and receive cast shadows) instead of rendering at flat full brightness. This
// snippet is injected via onBeforeCompile after the lit color is computed: it
// fades alpha to 0 at the edges and draws the amber selection border. It relies
// on `vMapUv` (provided automatically when the material has a `map`).
const EDGE_INJECT = /* glsl */`
  {
    float f = max(edgeFade, 0.001);
    float ax = smoothstep(0.0, f, vMapUv.x) * smoothstep(0.0, f, 1.0 - vMapUv.x);
    float ay = smoothstep(0.0, f, vMapUv.y) * smoothstep(0.0, f, 1.0 - vMapUv.y);
    float alpha = ax * ay;

    float bd = 0.015;
    float edgeMin = min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y));
    float border = isSelected * (1.0 - step(bd, edgeMin));

    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.72, 0.08), border * 0.85);
    gl_FragColor.a   = mix(gl_FragColor.a * alpha, 1.0, border * 0.8);
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

  // Edge-fade / selection uniforms live in a stable ref so they can be updated
  // without recompiling the material (onBeforeCompile wires them into the shader).
  const fx = useRef({ edgeFade: { value: img.edgeFade }, isSelected: { value: 0.0 } })

  const material = useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    const m = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.edgeFade   = fx.current.edgeFade
      shader.uniforms.isSelected = fx.current.isSelected
      shader.fragmentShader =
        'uniform float edgeFade;\nuniform float isSelected;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          EDGE_INJECT + '\n#include <dithering_fragment>',
        )
    }
    return m
  // Created once per image — texture is stable (cached by useLoader for this url).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fx.current.edgeFade.value = img.edgeFade }, [img.edgeFade])
  useEffect(() => { fx.current.isSelected.value = isSelected ? 1.0 : 0.0 }, [isSelected])
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
      receiveShadow
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
