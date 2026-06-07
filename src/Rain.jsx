import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const FIELD = 32
const STREAK_COUNT = 6000
const RIPPLE_COUNT = 500
const FALL_SPEED = 9.0
// Slight wind lean so streaks have a visible direction from above
const WIND_X = 1.8
const WIND_Z = 0.4

// ─── Ripple shaders ───────────────────────────────────────────────────────────

const RIPPLE_VERT = /* glsl */`
  attribute float aProgress;
  varying float vProgress;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vProgress = aProgress;
    gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

const RIPPLE_FRAG = /* glsl */`
  uniform float uIntensity;
  varying float vProgress;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv - 0.5;
    float r = length(uv);

    // Outer ring
    float r1 = vProgress * 0.44;
    float ring1 = 1.0 - smoothstep(0.0, 0.022, abs(r - r1) - 0.009);

    // Inner ring lags 0.2 behind outer
    float innerP = max(0.0, vProgress - 0.2);
    float r2 = innerP * 0.30;
    float ring2 = (1.0 - smoothstep(0.0, 0.018, abs(r - r2) - 0.006))
                  * step(0.001, innerP);

    float fade = pow(1.0 - vProgress, 0.7);
    float alpha = (ring1 + ring2 * 0.55) * fade * 0.55 * uIntensity;

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(0.82, 0.91, 1.0, alpha);
  }
`

// ─── Rain streak (falling drop) ───────────────────────────────────────────────

function RainStreaks({ intensity }) {
  const ref = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const drops = useMemo(() => Array.from({ length: STREAK_COUNT }, () => ({
    x: (Math.random() - 0.5) * FIELD,
    y: Math.random() * 10,
    z: (Math.random() - 0.5) * FIELD,
  })), [])

  // Geometry: thin cylinder leaned in wind direction
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.008, 0.012, 0.28, 4)
    // Tilt ~18° in wind direction so from above the streak shows as an angled mark
    g.rotateZ(0.32)
    return g
  }, [])

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.65, 0.82, 1.0),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((_, dt) => {
    const mesh = ref.current
    if (!mesh) return
    mat.opacity = intensity * 0.38
    for (let i = 0; i < STREAK_COUNT; i++) {
      const d = drops[i]
      d.y -= FALL_SPEED * dt
      d.x += WIND_X * dt
      d.z += WIND_Z * dt
      if (d.y < 0) {
        d.y = 7 + Math.random() * 7
        d.x = (Math.random() - 0.5) * FIELD
        d.z = (Math.random() - 0.5) * FIELD
      }
      dummy.position.set(d.x, d.y, d.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[geo, mat, STREAK_COUNT]} frustumCulled={false} />
  )
}

// ─── Ground ripples ───────────────────────────────────────────────────────────

function GroundRipples({ intensity }) {
  const ref = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const progress = useMemo(() => new Float32Array(RIPPLE_COUNT), [])
  const ripples = useMemo(() => Array.from({ length: RIPPLE_COUNT }, () => ({
    x: (Math.random() - 0.5) * FIELD,
    z: (Math.random() - 0.5) * FIELD,
  })), [])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: RIPPLE_VERT,
    fragmentShader: RIPPLE_FRAG,
    uniforms: { uIntensity: { value: intensity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])

  useEffect(() => {
    mat.uniforms.uIntensity.value = intensity
  }, [intensity, mat])

  // Stagger initial phases so ripples don't all start together
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      progress[i] = Math.random()
      dummy.position.set(ripples[i].x, 0.02, ripples[i].z)
      dummy.scale.setScalar(1.1)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  useFrame((_, dt) => {
    const mesh = ref.current
    if (!mesh) return
    mat.uniforms.uIntensity.value = intensity

    const attr = mesh.geometry.attributes.aProgress
    let matrixDirty = false

    for (let i = 0; i < RIPPLE_COUNT; i++) {
      progress[i] += dt * 0.7 * Math.max(0.3, intensity)
      if (progress[i] >= 1.0) {
        progress[i] = 0
        ripples[i].x = (Math.random() - 0.5) * FIELD
        ripples[i].z = (Math.random() - 0.5) * FIELD
        dummy.position.set(ripples[i].x, 0.02, ripples[i].z)
        dummy.scale.setScalar(1.1)
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        matrixDirty = true
      }
      attr.setX(i, progress[i])
    }

    attr.needsUpdate = true
    if (matrixDirty) mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, mat, RIPPLE_COUNT]} frustumCulled={false}>
      <planeGeometry args={[1, 1]}>
        <instancedBufferAttribute
          attach="attributes-aProgress"
          args={[progress, 1]}
        />
      </planeGeometry>
    </instancedMesh>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function Rain({ intensity = 1.0 }) {
  return (
    <>
      <RainStreaks intensity={intensity} />
      <GroundRipples intensity={intensity} />
    </>
  )
}
