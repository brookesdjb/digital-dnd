import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useLoader } from '@react-three/fiber'
import grassVertexShader from './shaders/grass.vert.glsl?raw'
import grassFragmentShader from './shaders/grass.frag.glsl?raw'

const HALF_WIDTH = 0.045
const BLADE_HEIGHT = 0.5
const FIELD_SIZE = 30
const MAX_BLADES = 70000
const LOD_DISTANCE = 18
// Must match Ground's repeat.set value in App.jsx
const TEX_REPEAT = 5

function buildGrassGeometry(segments) {
  const taper = 0.005
  const positions = []

  for (let i = 0; i < segments - 1; i++) {
    const y0 = (i / segments) * BLADE_HEIGHT
    const y1 = ((i + 1) / segments) * BLADE_HEIGHT
    positions.push(
      -HALF_WIDTH + taper * i, y0, 0,
       HALF_WIDTH - taper * i, y0, 0,
      -HALF_WIDTH + taper * (i + 1), y1, 0,
      -HALF_WIDTH + taper * (i + 1), y1, 0,
       HALF_WIDTH - taper * i, y0, 0,
       HALF_WIDTH - taper * (i + 1), y1, 0,
    )
  }
  positions.push(
    -HALF_WIDTH + taper * (segments - 1), ((segments - 1) / segments) * BLADE_HEIGHT, 0,
     HALF_WIDTH - taper * (segments - 1), ((segments - 1) / segments) * BLADE_HEIGHT, 0,
     0, BLADE_HEIGHT, 0,
  )

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.computeVertexNormals()
  return geo
}

// Downsample the texture image onto a canvas and return its ImageData
function extractPixelData(image, size = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, size, size)
  return ctx.getImageData(0, 0, size, size)
}

// Sample greenness [0..1] at a world (x, z) position given the tiled texture pixel data
function sampleGreenness(x, z, pixelData) {
  const size = pixelData.width
  // Normalised [0,1] UV with tiling, then mod back to single tile
  const u = (((x / FIELD_SIZE) + 0.5) * TEX_REPEAT) % 1
  const v = (((z / FIELD_SIZE) + 0.5) * TEX_REPEAT) % 1
  const px = Math.min(Math.floor(u * size), size - 1)
  const py = Math.min(Math.floor(v * size), size - 1)
  const i = (py * size + px) * 4
  const r = pixelData.data[i]
  const g = pixelData.data[i + 1]
  const b = pixelData.data[i + 2]
  // How much green dominates over the other channels
  const raw = (g - (r + b) * 0.5) / 255
  // Power curve: very green → near 1, slightly green → low, grey/rock → 0
  return Math.max(0, Math.min(1, Math.pow(Math.max(0, raw * 8), 1.6)))
}

export function GrassField({ windSpeed = 1.2, windStrength = 1.0, baseColor = '#3a5c1a', tipColor = '#a8c45a' }) {
  const highRef = useRef()
  const lowRef = useRef()
  const { camera, clock } = useThree()

  const densityTex = useLoader(THREE.TextureLoader, '/textures/aerial_grass_rock_diff_2k.jpg')

  const pixelData = useMemo(() => {
    if (!densityTex?.image) return null
    return extractPixelData(densityTex.image)
  }, [densityTex])

  const highGeo = useMemo(() => buildGrassGeometry(7), [])
  const lowGeo = useMemo(() => buildGrassGeometry(2), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: grassVertexShader,
    fragmentShader: grassFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: windSpeed },
      uWindStrength: { value: windStrength },
      uHalfWidth: { value: HALF_WIDTH },
      uBaseColor: { value: new THREE.Color(baseColor) },
      uTipColor: { value: new THREE.Color(tipColor) },
    },
    side: THREE.DoubleSide,
  }), [])

  useEffect(() => {
    material.uniforms.uSpeed.value = windSpeed
    material.uniforms.uWindStrength.value = windStrength
    material.uniforms.uBaseColor.value.set(baseColor)
    material.uniforms.uTipColor.value.set(tipColor)
  }, [windSpeed, windStrength, baseColor, tipColor])

  // Regenerate blades whenever pixel data is ready
  const blades = useMemo(() => {
    if (!pixelData) return []
    const arr = []
    // Over-sample candidates to hit ~MAX_BLADES accepted blades
    const candidates = MAX_BLADES * 6
    for (let i = 0; i < candidates && arr.length < MAX_BLADES; i++) {
      const x = (Math.random() - 0.5) * FIELD_SIZE
      const z = (Math.random() - 0.5) * FIELD_SIZE
      const density = sampleGreenness(x, z, pixelData)
      if (Math.random() < density) {
        arr.push({
          x, z,
          ry: Math.random() * Math.PI * 2,
          scale: 0.35 + Math.random() * 0.5,
        })
      }
    }
    return arr
  }, [pixelData])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    material.uniforms.uTime.value = clock.getElapsedTime()

    if (!highRef.current || !lowRef.current || blades.length === 0) return

    let hi = 0
    let lo = 0

    for (let i = 0; i < blades.length; i++) {
      const { x, z, ry, scale } = blades[i]
      const dx = x - camera.position.x
      const dz = z - camera.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      dummy.position.set(x, 0, z)
      dummy.rotation.y = ry
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()

      if (dist < LOD_DISTANCE) {
        highRef.current.setMatrixAt(hi++, dummy.matrix)
      } else {
        lowRef.current.setMatrixAt(lo++, dummy.matrix)
      }
    }

    highRef.current.count = hi
    lowRef.current.count = lo
    highRef.current.instanceMatrix.needsUpdate = true
    lowRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={highRef} args={[highGeo, material, MAX_BLADES]} frustumCulled={false} />
      <instancedMesh ref={lowRef} args={[lowGeo, material, MAX_BLADES]} frustumCulled={false} />
    </>
  )
}
