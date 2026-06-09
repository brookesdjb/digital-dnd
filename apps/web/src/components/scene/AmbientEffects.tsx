'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Shared geometry helper ────────────────────────────────────────────────────

function makeDiscGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1)
  g.rotateX(-Math.PI / 2)
  return g
}

// ── Shared shaders ────────────────────────────────────────────────────────────

// Vertex: passes UV + instance transform. Used by Snow, Dust, Ash.
const UV_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

// Fragment: soft circle with configurable tint + opacity. Used by Snow, Dust, Ash.
const CIRCLE_FRAG = /* glsl */`
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3  uTint;
  varying vec2  vUv;
  void main() {
    float d = length(vUv - 0.5);
    float a = (1.0 - smoothstep(0.35, 0.5, d)) * uIntensity * uOpacity;
    if (a < 0.006) discard;
    gl_FragColor = vec4(uTint, a);
  }
`

// Vertex: passes UV, per-instance phase, and world Y height. Used by Embers.
const EMBER_VERT = /* glsl */`
  attribute float aPhase;
  varying float   vPhase;
  varying vec2    vUv;
  varying float   vHeight;
  void main() {
    vUv    = uv;
    vPhase = aPhase;
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vHeight = wp.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

// Fragment: double-frequency flicker + height-based fade + orange-to-red color shift.
const EMBER_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  varying float vPhase;
  varying vec2  vUv;
  varying float vHeight;
  void main() {
    float d      = length(vUv - 0.5);
    float circle = 1.0 - smoothstep(0.28, 0.5, d);
    if (circle < 0.005) discard;
    float f1      = sin(uTime * 7.0  + vPhase * 3.7) * 0.5 + 0.5;
    float f2      = sin(uTime * 13.0 + vPhase * 1.9) * 0.5 + 0.5;
    float flicker = f1 * f2;
    float fadeIn  = smoothstep(0.0, 0.4, vHeight);
    float fadeOut = smoothstep(5.5, 4.2, vHeight);
    float t       = clamp(vHeight / 5.5, 0.0, 1.0);
    vec3  col     = mix(vec3(1.0, 0.65, 0.0), vec3(1.0, 0.10, 0.0), t);
    float alpha   = circle * (0.4 + 0.6 * flicker) * fadeIn * fadeOut * uIntensity * 0.95;
    if (alpha < 0.01) discard;
    gl_FragColor  = vec4(col, alpha);
  }
`

// Vertex: passes UV + per-instance phase. Used by Fireflies.
const FIREFLY_VERT = /* glsl */`
  attribute float aPhase;
  varying float   vPhase;
  varying vec2    vUv;
  void main() {
    vUv    = uv;
    vPhase = aPhase;
    gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

// Fragment: slow blink with soft glow + bright core. Green-yellow palette.
const FIREFLY_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  varying float vPhase;
  varying vec2  vUv;
  void main() {
    float d     = length(vUv - 0.5);
    float glow  = pow(max(0.0, 1.0 - d * 2.0), 2.0);
    if (glow < 0.004) discard;
    float blink = pow(max(0.0, sin(uTime * 1.15 + vPhase * 2.3)), 4.0);
    float g     = 0.85 + 0.15 * sin(vPhase);
    float r     = 0.2  + 0.5  * sin(vPhase + 0.5);
    vec3  col   = vec3(r, g, 0.1);
    float alpha = glow * blink * uIntensity * 0.9;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`

// Vertex: passes UV + world XZ for world-position-based noise. Used by Mist.
const MIST_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec2 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vWorld  = wp.xz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

// Fragment: layered sine noise + edge fade for organic mist appearance.
const MIST_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uTint;
  varying vec2  vUv;
  varying vec2  vWorld;
  void main() {
    vec2  p  = vWorld * 0.15 + uTime * vec2(0.035, 0.022);
    float n  = sin(p.x * 2.8) * sin(p.y * 3.2) * 0.5 + 0.5;
    n       *= sin(p.x * 5.5 - uTime * 0.04) * 0.25 + 0.75;
    n       += sin(p.x * 9.0 + uTime * 0.06) * sin(p.y * 8.0) * 0.08;
    float ex = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float ey = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
    float a  = n * ex * ey * 0.14 * uIntensity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uTint, a);
  }
`

// ── Snow ───────────────────────────────────────────────────────────────────────

const BASE_SNOW = 2500

interface SnowProps { intensity: number; fieldSize: number; hemSkyColor: string }

function Snow({ intensity, fieldSize, hemSkyColor }: SnowProps) {
  const ref   = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fieldRef = useRef(fieldSize)
  useEffect(() => { fieldRef.current = fieldSize }, [fieldSize])

  const count  = useMemo(() => Math.round(BASE_SNOW * Math.sqrt(fieldSize / 32)), [fieldSize])
  const flakes = useMemo(() => Array.from({ length: count }, () => ({
    x:  (Math.random() - 0.5) * fieldSize,
    y:  Math.random() * 10,
    z:  (Math.random() - 0.5) * fieldSize,
    dx: (Math.random() - 0.5) * 0.28,
    dz: (Math.random() - 0.5) * 0.28,
    vy: 0.7  + Math.random() * 1.6,
    s:  0.04 + Math.random() * 0.08,
  })), [count, fieldSize])

  const geo = useMemo(() => makeDiscGeo(), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: UV_VERT,
    fragmentShader: CIRCLE_FRAG,
    uniforms: {
      uIntensity: { value: 0 },
      uOpacity:   { value: 0.7 },
      uTint:      { value: new THREE.Color(0.88, 0.94, 1.0) },
    },
    transparent: true,
    depthWrite: false,
  }), [])

  useEffect(() => {
    const sky = new THREE.Color(hemSkyColor)
    mat.uniforms.uTint.value.set(0.88, 0.94, 1.0)
    mat.uniforms.uTint.value.lerp(sky, 0.12)
  }, [hemSkyColor, mat])

  useFrame((_, dt) => {
    if (intensity === 0) return
    const mesh = ref.current
    if (!mesh) return
    mat.uniforms.uIntensity.value = Math.min(intensity, 1.5)
    for (let i = 0; i < count; i++) {
      const f = flakes[i]
      f.y -= f.vy * dt
      f.x += f.dx * dt
      f.z += f.dz * dt
      if (f.y < 0) {
        f.y = 7 + Math.random() * 6
        f.x = (Math.random() - 0.5) * fieldRef.current
        f.z = (Math.random() - 0.5) * fieldRef.current
      }
      dummy.position.set(f.x, f.y, f.z)
      dummy.scale.setScalar(f.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} visible={intensity > 0} />
}

// ── Embers ────────────────────────────────────────────────────────────────────

const EMBER_COUNT = 400

interface EmbersProps { intensity: number; fieldSize: number }

function Embers({ intensity, fieldSize }: EmbersProps) {
  const ref   = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fieldRef = useRef(fieldSize)
  useEffect(() => { fieldRef.current = fieldSize }, [fieldSize])

  const sparks = useMemo(() => Array.from({ length: EMBER_COUNT }, () => ({
    x:     (Math.random() - 0.5) * fieldSize * 0.55,
    y:     Math.random() * 4.5,
    z:     (Math.random() - 0.5) * fieldSize * 0.55,
    vy:    0.22 + Math.random() * 0.55,
    phase: Math.random() * Math.PI * 2,
    px:    Math.random() * Math.PI * 2,
    pz:    Math.random() * Math.PI * 2,
    s:     0.04 + Math.random() * 0.05,
  })), [fieldSize])

  const geo = useMemo(() => {
    const g = makeDiscGeo()
    const phases = new Float32Array(EMBER_COUNT)
    for (let i = 0; i < EMBER_COUNT; i++) phases[i] = sparks[i].phase
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    return g
  }, [sparks])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uIntensity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((state, dt) => {
    if (intensity === 0) return
    const mesh = ref.current
    if (!mesh) return
    mat.uniforms.uTime.value      = state.clock.elapsedTime
    mat.uniforms.uIntensity.value = Math.min(intensity, 1.5)
    const t = state.clock.elapsedTime
    for (let i = 0; i < EMBER_COUNT; i++) {
      const s = sparks[i]
      s.y += s.vy * dt
      s.x += Math.sin(t * 1.3 + s.px) * 0.012
      s.z += Math.cos(t * 1.0 + s.pz) * 0.010
      if (s.y > 5.5) {
        s.y = 0
        s.x = (Math.random() - 0.5) * fieldRef.current * 0.55
        s.z = (Math.random() - 0.5) * fieldRef.current * 0.55
      }
      dummy.position.set(s.x, s.y, s.z)
      dummy.scale.setScalar(s.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mat, EMBER_COUNT]} frustumCulled={false} visible={intensity > 0} />
}

// ── Dust Motes ────────────────────────────────────────────────────────────────

const DUST_COUNT = 250

interface DustMotesProps {
  intensity: number; fieldSize: number
  hemSkyColor: string; hemGroundColor: string
}

function DustMotes({ intensity, fieldSize, hemSkyColor, hemGroundColor }: DustMotesProps) {
  const ref   = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fieldRef = useRef(fieldSize)
  useEffect(() => { fieldRef.current = fieldSize }, [fieldSize])

  const motes = useMemo(() => Array.from({ length: DUST_COUNT }, () => ({
    x:        (Math.random() - 0.5) * fieldSize,
    y:        0.3 + Math.random() * 3.5,
    z:        (Math.random() - 0.5) * fieldSize,
    dx:       (Math.random() - 0.5) * 0.12,
    dz:       (Math.random() - 0.5) * 0.12,
    phase:    Math.random() * Math.PI * 2,
    bobSpeed: 0.3 + Math.random() * 0.5,
    bobAmp:   0.04 + Math.random() * 0.06,
    s:        0.07 + Math.random() * 0.08,
  })), [fieldSize])

  const geo = useMemo(() => makeDiscGeo(), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: UV_VERT,
    fragmentShader: CIRCLE_FRAG,
    uniforms: {
      uIntensity: { value: 0 },
      uOpacity:   { value: 0.12 },
      uTint:      { value: new THREE.Color(0.75, 0.70, 0.60) },
    },
    transparent: true,
    depthWrite: false,
  }), [])

  useEffect(() => {
    const sky = new THREE.Color(hemSkyColor)
    const gnd = new THREE.Color(hemGroundColor)
    mat.uniforms.uTint.value.set(0.75, 0.70, 0.60)
    mat.uniforms.uTint.value.lerp(sky.clone().lerp(gnd, 0.3), 0.4)
  }, [hemSkyColor, hemGroundColor, mat])

  useFrame((state, dt) => {
    if (intensity === 0) return
    const mesh = ref.current
    if (!mesh) return
    mat.uniforms.uIntensity.value = Math.min(intensity, 1.0)
    const t    = state.clock.elapsedTime
    const half = fieldRef.current / 2
    for (let i = 0; i < DUST_COUNT; i++) {
      const m = motes[i]
      m.x += m.dx * dt
      m.z += m.dz * dt
      if (m.x >  half) m.x -= fieldRef.current
      if (m.x < -half) m.x += fieldRef.current
      if (m.z >  half) m.z -= fieldRef.current
      if (m.z < -half) m.z += fieldRef.current
      dummy.position.set(m.x, m.y + Math.sin(t * m.bobSpeed + m.phase) * m.bobAmp, m.z)
      dummy.scale.setScalar(m.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mat, DUST_COUNT]} frustumCulled={false} visible={intensity > 0} />
}

// ── Drifting Mist ─────────────────────────────────────────────────────────────

const MIST_COUNT = 10

interface DriftingMistProps {
  intensity: number; fieldSize: number
  hemSkyColor: string; hemGroundColor: string
}

function DriftingMist({ intensity, fieldSize, hemSkyColor, hemGroundColor }: DriftingMistProps) {
  const ref   = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fieldRef = useRef(fieldSize)
  useEffect(() => { fieldRef.current = fieldSize }, [fieldSize])

  const patches = useMemo(() => Array.from({ length: MIST_COUNT }, () => ({
    x:     (Math.random() - 0.5) * fieldSize,
    y:     0.3 + Math.random() * 1.4,
    z:     (Math.random() - 0.5) * fieldSize,
    sx:    3 + Math.random() * 7,
    sz:    2 + Math.random() * 6,
    speed: 0.06 + Math.random() * 0.09,
  })), [fieldSize])

  const geo = useMemo(() => makeDiscGeo(), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: MIST_VERT,
    fragmentShader: MIST_FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uIntensity: { value: 0 },
      uTint:      { value: new THREE.Color(0.92, 0.94, 0.97) },
    },
    transparent: true,
    depthWrite: false,
  }), [])

  useEffect(() => {
    const sky = new THREE.Color(hemSkyColor)
    const gnd = new THREE.Color(hemGroundColor)
    mat.uniforms.uTint.value.set(0.92, 0.94, 0.97)
    mat.uniforms.uTint.value.lerp(sky.clone().lerp(gnd, 0.25), 0.22)
  }, [hemSkyColor, hemGroundColor, mat])

  useFrame((state, dt) => {
    if (intensity === 0) return
    const mesh = ref.current
    if (!mesh) return
    mat.uniforms.uTime.value      = state.clock.elapsedTime
    mat.uniforms.uIntensity.value = Math.min(intensity, 2.0)
    const half = fieldRef.current / 2
    for (let i = 0; i < MIST_COUNT; i++) {
      const p = patches[i]
      p.x += p.speed * dt
      if (p.x > half + p.sx / 2) p.x = -half - p.sx / 2
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.set(p.sx, 1, p.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mat, MIST_COUNT]} frustumCulled={false} visible={intensity > 0} />
}

// ── Fireflies ─────────────────────────────────────────────────────────────────

const FIREFLY_COUNT = 55

interface FirefliesProps { intensity: number; fieldSize: number }

function Fireflies({ intensity, fieldSize }: FirefliesProps) {
  const ref   = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fieldRef = useRef(fieldSize)
  useEffect(() => { fieldRef.current = fieldSize }, [fieldSize])

  const bugs = useMemo(() => Array.from({ length: FIREFLY_COUNT }, () => ({
    x:         (Math.random() - 0.5) * fieldSize,
    y:         0.3 + Math.random() * 2.5,
    z:         (Math.random() - 0.5) * fieldSize,
    dx:        (Math.random() - 0.5) * 0.15,
    dz:        (Math.random() - 0.5) * 0.15,
    phase:     Math.random() * Math.PI * 2,
    bobSpeed:  0.5 + Math.random() * 0.5,
    bobAmp:    0.08 + Math.random() * 0.12,
    s:         0.10 + Math.random() * 0.08,
  })), [fieldSize])

  const geo = useMemo(() => {
    const g = makeDiscGeo()
    const phases = new Float32Array(FIREFLY_COUNT)
    for (let i = 0; i < FIREFLY_COUNT; i++) phases[i] = bugs[i].phase
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    return g
  }, [bugs])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: FIREFLY_VERT,
    fragmentShader: FIREFLY_FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uIntensity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((state, dt) => {
    if (intensity === 0) return
    const mesh = ref.current
    if (!mesh) return
    mat.uniforms.uTime.value      = state.clock.elapsedTime
    mat.uniforms.uIntensity.value = Math.min(intensity, 1.5)
    const t    = state.clock.elapsedTime
    const half = fieldRef.current / 2
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const b = bugs[i]
      b.x += b.dx * dt
      b.z += b.dz * dt
      if (b.x >  half) b.x -= fieldRef.current
      if (b.x < -half) b.x += fieldRef.current
      if (b.z >  half) b.z -= fieldRef.current
      if (b.z < -half) b.z += fieldRef.current
      dummy.position.set(b.x, b.y + Math.sin(t * b.bobSpeed + b.phase) * b.bobAmp, b.z)
      dummy.scale.setScalar(b.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mat, FIREFLY_COUNT]} frustumCulled={false} visible={intensity > 0} />
}

// ── Ash ───────────────────────────────────────────────────────────────────────

const BASE_ASH = 800

interface AshProps {
  intensity: number; fieldSize: number
  hemSkyColor: string; hemGroundColor: string
}

function Ash({ intensity, fieldSize, hemSkyColor, hemGroundColor }: AshProps) {
  const ref   = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fieldRef = useRef(fieldSize)
  useEffect(() => { fieldRef.current = fieldSize }, [fieldSize])

  const count  = useMemo(() => Math.round(BASE_ASH * Math.sqrt(fieldSize / 32)), [fieldSize])
  const flakes = useMemo(() => Array.from({ length: count }, () => {
    const up = Math.random() > 0.35
    return {
      x:  (Math.random() - 0.5) * fieldSize,
      y:  Math.random() * 6,
      z:  (Math.random() - 0.5) * fieldSize,
      dx: (Math.random() - 0.5) * 0.15,
      dz: (Math.random() - 0.5) * 0.15,
      vy: up ? 0.08 + Math.random() * 0.18 : -(0.04 + Math.random() * 0.10),
      s:  0.025 + Math.random() * 0.04,
    }
  }), [count, fieldSize])

  const geo = useMemo(() => makeDiscGeo(), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: UV_VERT,
    fragmentShader: CIRCLE_FRAG,
    uniforms: {
      uIntensity: { value: 0 },
      uOpacity:   { value: 0.5 },
      uTint:      { value: new THREE.Color(0.82, 0.80, 0.78) },
    },
    transparent: true,
    depthWrite: false,
  }), [])

  useEffect(() => {
    const sky = new THREE.Color(hemSkyColor)
    const gnd = new THREE.Color(hemGroundColor)
    mat.uniforms.uTint.value.set(0.82, 0.80, 0.78)
    mat.uniforms.uTint.value.lerp(sky.clone().lerp(gnd, 0.3), 0.28)
  }, [hemSkyColor, hemGroundColor, mat])

  useFrame((_, dt) => {
    if (intensity === 0) return
    const mesh = ref.current
    if (!mesh) return
    mat.uniforms.uIntensity.value = Math.min(intensity, 1.0)
    const half = fieldRef.current / 2
    for (let i = 0; i < count; i++) {
      const f = flakes[i]
      f.y += f.vy * dt
      f.x += f.dx * dt
      f.z += f.dz * dt
      if (f.y > 7) { f.y = 0; f.x = (Math.random() - 0.5) * fieldRef.current; f.z = (Math.random() - 0.5) * fieldRef.current }
      if (f.y < 0) { f.y = 6; f.x = (Math.random() - 0.5) * fieldRef.current; f.z = (Math.random() - 0.5) * fieldRef.current }
      if (f.x >  half) f.x -= fieldRef.current
      if (f.x < -half) f.x += fieldRef.current
      if (f.z >  half) f.z -= fieldRef.current
      if (f.z < -half) f.z += fieldRef.current
      dummy.position.set(f.x, f.y, f.z)
      dummy.scale.setScalar(f.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} visible={intensity > 0} />
}

// ── Composite export ──────────────────────────────────────────────────────────

export interface AmbientEffectsProps {
  fieldSize:      number
  hemSkyColor:    string
  hemGroundColor: string
  embers:    number
  dust:      number
  snow:      number
  mist:      number
  fireflies: number
  ash:       number
}

export function AmbientEffects({
  fieldSize, hemSkyColor, hemGroundColor,
  embers, dust, snow, mist, fireflies, ash,
}: AmbientEffectsProps) {
  return (
    <>
      <Snow         intensity={snow}      fieldSize={fieldSize} hemSkyColor={hemSkyColor} />
      <Embers       intensity={embers}    fieldSize={fieldSize} />
      <DustMotes    intensity={dust}      fieldSize={fieldSize} hemSkyColor={hemSkyColor} hemGroundColor={hemGroundColor} />
      <DriftingMist intensity={mist}      fieldSize={fieldSize} hemSkyColor={hemSkyColor} hemGroundColor={hemGroundColor} />
      <Fireflies    intensity={fireflies} fieldSize={fieldSize} />
      <Ash          intensity={ash}       fieldSize={fieldSize} hemSkyColor={hemSkyColor} hemGroundColor={hemGroundColor} />
    </>
  )
}
