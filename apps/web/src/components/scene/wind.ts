import * as THREE from 'three'

// ── shared uniforms ───────────────────────────────────────────────────────────
// All wind types share one uniform object — controlled globally from the cockpit.
// Motion profiles differ via shader code, not separate uniform sets.

export const windUniforms = {
  uTime:         { value: 0 },
  uWindSpeed:    { value: 1.4 },
  uWindStrength: { value: 1.0 },
}

// Legacy alias — keeps existing callers working without changes.
export { windUniforms as grassWindUniforms }

export type WindType = 'grass' | 'tree' | 'bush' | 'dead'

// ── shader preamble ───────────────────────────────────────────────────────────

const UNIFORMS_DECL =
  `uniform float uTime;\nuniform float uWindSpeed;\nuniform float uWindStrength;\n`

// World position of the current vertex, handles both instanced and non-instanced meshes.
const WORLD_POS = /* glsl */`
  #ifdef USE_INSTANCING
    vec3 wPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
`

// ── grass ─────────────────────────────────────────────────────────────────────
// uv.y proxy for blade height; gentle lateral sway.

function grassOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uTime         = windUniforms.uTime
  shader.uniforms.uWindSpeed    = windUniforms.uWindSpeed
  shader.uniforms.uWindStrength = windUniforms.uWindStrength
  shader.vertexShader = UNIFORMS_DECL + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    /* glsl */`
    #include <begin_vertex>
    float windHeight = 1.0 - uv.y;
    ${WORLD_POS}
    float wave = sin(uTime * uWindSpeed       + wPos.x * 1.9 + wPos.z * 1.3) * 0.20;
    float gust = sin(uTime * uWindSpeed * 0.2 + wPos.x * 0.5               ) * 0.12;
    transformed.x += (wave + gust) * windHeight * uWindStrength;
    transformed.z += wave * 0.4   * windHeight * uWindStrength;
    `
  )
}

export function applyGrassWind(material: THREE.Material) {
  const mat = material as THREE.Material & { _windApplied?: boolean; needsUpdate: boolean }
  if (mat._windApplied) return
  mat._windApplied = true
  ;(mat as any).onBeforeCompile = grassOnBeforeCompile
  ;(mat as any).customProgramCacheKey = () => 'grass-wind-v1'
  mat.needsUpdate = true
}

// ── tree ──────────────────────────────────────────────────────────────────────
// position.y height factor: trunk stays planted, crown sways.
// Slow primary sway + lazy gust + fast leaf flutter.

function treeOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uTime         = windUniforms.uTime
  shader.uniforms.uWindSpeed    = windUniforms.uWindSpeed
  shader.uniforms.uWindStrength = windUniforms.uWindStrength
  shader.vertexShader = UNIFORMS_DECL + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    /* glsl */`
    #include <begin_vertex>
    float heightFactor = clamp(position.y / 6.0, 0.0, 1.0);
    ${WORLD_POS}
    float wave    = sin(uTime * uWindSpeed * 0.50 + wPos.x * 0.90 + wPos.z * 0.70) * 0.22;
    float gust    = sin(uTime * uWindSpeed * 0.18 + wPos.x * 0.40               ) * 0.14;
    float flutter = sin(uTime * uWindSpeed * 2.80 + wPos.x * 5.00 + wPos.z * 4.20) * 0.05;
    transformed.x += (wave + gust + flutter) * heightFactor * uWindStrength * 0.4;
    transformed.z += (wave * 0.55 + flutter * 0.30) * heightFactor * uWindStrength * 0.4;
    `
  )
}

export function applyTreeWind(material: THREE.Material) {
  const mat = material as THREE.Material & { _windApplied?: boolean; needsUpdate: boolean }
  if (mat._windApplied) return
  mat._windApplied = true
  ;(mat as any).onBeforeCompile = treeOnBeforeCompile
  ;(mat as any).customProgramCacheKey = () => 'tree-wind-v1'
  mat.needsUpdate = true
}

// ── bush ──────────────────────────────────────────────────────────────────────
// Short plants — no height gradient; moderate amplitude, slightly faster than tree.

function bushOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uTime         = windUniforms.uTime
  shader.uniforms.uWindSpeed    = windUniforms.uWindSpeed
  shader.uniforms.uWindStrength = windUniforms.uWindStrength
  shader.vertexShader = UNIFORMS_DECL + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    /* glsl */`
    #include <begin_vertex>
    ${WORLD_POS}
    float wave = sin(uTime * uWindSpeed * 0.90 + wPos.x * 1.60 + wPos.z * 1.20) * 0.14;
    float gust = sin(uTime * uWindSpeed * 0.32 + wPos.z * 0.55               ) * 0.09;
    transformed.x += (wave + gust) * uWindStrength * 0.4;
    transformed.z += wave * 0.45   * uWindStrength * 0.4;
    `
  )
}

export function applyBushWind(material: THREE.Material) {
  const mat = material as THREE.Material & { _windApplied?: boolean; needsUpdate: boolean }
  if (mat._windApplied) return
  mat._windApplied = true
  ;(mat as any).onBeforeCompile = bushOnBeforeCompile
  ;(mat as any).customProgramCacheKey = () => 'bush-wind-v1'
  mat.needsUpdate = true
}

// ── dead tree ─────────────────────────────────────────────────────────────────
// Stiff, slow, minimal — with an occasional creak at higher frequencies.

function deadOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uTime         = windUniforms.uTime
  shader.uniforms.uWindSpeed    = windUniforms.uWindSpeed
  shader.uniforms.uWindStrength = windUniforms.uWindStrength
  shader.vertexShader = UNIFORMS_DECL + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    /* glsl */`
    #include <begin_vertex>
    float heightFactor = clamp(position.y / 6.0, 0.0, 1.0);
    ${WORLD_POS}
    float wave  = sin(uTime * uWindSpeed * 0.28 + wPos.x * 0.65) * 0.09;
    float creak = sin(uTime * uWindSpeed * 2.20 + wPos.x * 6.00) * 0.018;
    transformed.x += (wave + creak) * heightFactor * uWindStrength * 0.4;
    transformed.z += wave * 0.30    * heightFactor * uWindStrength * 0.4;
    `
  )
}

export function applyDeadWind(material: THREE.Material) {
  const mat = material as THREE.Material & { _windApplied?: boolean; needsUpdate: boolean }
  if (mat._windApplied) return
  mat._windApplied = true
  ;(mat as any).onBeforeCompile = deadOnBeforeCompile
  ;(mat as any).customProgramCacheKey = () => 'dead-wind-v1'
  mat.needsUpdate = true
}

// ── dispatcher ────────────────────────────────────────────────────────────────

export function applyWindByType(material: THREE.Material, type: WindType) {
  switch (type) {
    case 'tree': return applyTreeWind(material)
    case 'bush': return applyBushWind(material)
    case 'dead': return applyDeadWind(material)
    default:     return applyGrassWind(material)
  }
}

// ── tick ─────────────────────────────────────────────────────────────────────

export function tickWind(elapsed: number, speed: number, strength: number) {
  windUniforms.uTime.value         = elapsed
  windUniforms.uWindSpeed.value    = speed
  windUniforms.uWindStrength.value = strength
}
