uniform vec3 uBaseColor;
uniform vec3 uTipColor;

varying float vElevation;
varying float vSideGradient;
varying vec3 vNormal;
varying vec3 vFakeNormal;
varying vec3 vPosition;

vec3 directionalLight(vec3 lightColor, float lightIntensity, vec3 normal, vec3 lightPos, vec3 viewDir, float specPow) {
  vec3 lightDir = normalize(lightPos);
  vec3 lightRef = reflect(-lightDir, normal);
  float shading = max(0.0, dot(normal, lightDir));
  float specular = pow(max(0.0, -dot(lightRef, viewDir)), specPow) * shading;
  return lightColor * lightIntensity * (shading + specular);
}

void main() {
  float gradient = smoothstep(0.0, 1.0, vElevation);
  vec3 finalColor = mix(uBaseColor, uTipColor, gradient);

  vec3 normal = gl_FrontFacing ? vFakeNormal : -vFakeNormal;
  vec3 viewDir = normalize(cameraPosition - vPosition);

  // Lifted ambient to approximate HDR IBL contribution the ground gets automatically
  vec3 light = vec3(1.55, 1.45, 1.15);
  light += directionalLight(vec3(1.0, 0.88, 0.65), 0.5, normal, vec3(3.0, 5.0, 2.0), viewDir, 80.0);

  finalColor *= light;

  gl_FragColor = vec4(finalColor, 1.0);
}
