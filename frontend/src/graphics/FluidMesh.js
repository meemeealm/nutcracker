import * as THREE from "three";
import { StochasticForceModel, clamp } from "../utils/Random.js";

/**
 * Nutcracker — Progressive GPU Fluid & Pigment Simulation Engine
 *
 * 1. THE PROGRESSIVE STATE MECHANISM:
 *    The painting is a living, continuous state (P_n), not a static frame:
 *    P_0 = Original base painting (WebP texture)
 *    P_1 = P_0 + music_frame_0 + randomness_0
 *    P_2 = P_1 + music_frame_1 + randomness_1
 *    P_n = P_{n-1} + music_frame_{n-1} + randomness_{n-1}
 *
 * 2. NAVIER-STOKES FLUID DYNAMICS & PHYSICAL PIGMENT MODEL:
 *    - Semi-Lagrangian Advection
 *    - Incompressible Navier-Stokes (Jacobi Pressure Poisson Solver)
 *    - Vorticity Confinement (retains turbulent paint curls without numerical blur)
 *    - Multi-scale musical force & curl injection (F_ML + alpha * F_noise)
 *    - Physical pigment smearing, diffusion (Laplacian bleeding), and color mixing
 *    - Impasto relief normal mapping & wet oil specular sheen
 */

const baseVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// 1. Velocity & Field Advection Shader
const advectionShader = `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  // Advect in UV coordinate space (velocity in UV-units/sec)
  vec2 coord = vUv - uDt * uSpeed * vel * 0.35;
  vec4 result = texture2D(uSource, coord);
  gl_FragColor = result * uDissipation;
}
`;

// 2. Music & Stochastic Force Injection Shader
const forceShader = `
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uTime;
uniform float uFlow;
uniform float uTurbulence;
uniform float uDisplacement;
uniform float uWarp;
uniform float uActivity;
uniform float uNoiseIntensity;

varying vec2 vUv;

// Procedural pseudo-random hash
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// 2D Noise for GPU stochastic field
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// 2D Curl noise (divergence-free vorticity)
vec2 curlNoise(vec2 p, float t) {
  float eps = 0.05;
  float nY1 = noise(p + vec2(0.0, eps) + vec2(t * 0.25));
  float nY0 = noise(p - vec2(0.0, eps) + vec2(t * 0.25));
  float nX1 = noise(p + vec2(eps, 0.0) + vec2(t * 0.25));
  float nX0 = noise(p - vec2(eps, 0.0) + vec2(t * 0.25));
  return vec2((nY1 - nY0) / (2.0 * eps), -(nX1 - nX0) / (2.0 * eps));
}

void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vec2 center = vec2(0.5, 0.5);
  vec2 toCenter = vUv - center;
  float dist = length(toCenter);

  // Music Force: Primary Swirling Vortex with organic frequency oscillation
  float swirlAngle = uTime * 1.0 + dist * 5.0 * (1.0 + uWarp * 1.5);
  vec2 swirlDir = vec2(-toCenter.y, toCenter.x) / (dist + 0.06);
  float swirlStrength = (0.25 + uFlow * 1.5) * exp(-dist * 1.6);

  // Music Force: Multi-center acoustic perturbation
  vec2 waveForce = vec2(
    sin(vUv.y * 10.0 + uTime * 1.8 + uWarp * 2.5),
    cos(vUv.x * 10.0 - uTime * 1.6 + uDisplacement * 2.5)
  ) * (0.15 + uDisplacement * 0.8);

  // Stochastic Field: F_noise(t) curl noise
  vec2 stochasticField = curlNoise(vUv * (4.0 + uTurbulence * 6.0), uTime * 0.7) * (0.2 + uTurbulence * 0.9);

  // Stochastic Blending: F(t) = F_ML(t) + alpha * F_noise(t)
  vec2 fML = swirlDir * swirlStrength + waveForce;
  vec2 totalForce = fML + uNoiseIntensity * stochasticField;

  // Boosted by track musical activity
  totalForce *= (0.6 + uActivity * 1.4);

  // Soft boundary damping to prevent unnatural edge clipping
  float edgeDamp = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) *
                   smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);

  vel += totalForce * uDt * edgeDamp;
  vel *= 0.99; // slight viscous damping

  // Velocity clamp to prevent numerical explosion
  float spd = length(vel);
  if (spd > 2.0) {
    vel = (vel / spd) * 2.0;
  }

  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

// 3. Vorticity (Curl) Calculation Shader
const vorticityShader = `
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;

  float curl = 0.5 * ((R - L) - (T - B));
  gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
}
`;

// 4. Vorticity Confinement Force Shader (restores swirling micro-eddies)
const vorticityForceShader = `
uniform sampler2D uVelocity;
uniform sampler2D uVorticity;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uCurlStrength;

varying vec2 vUv;

void main() {
  float L = abs(texture2D(uVorticity, vUv - vec2(uTexelSize.x, 0.0)).r);
  float R = abs(texture2D(uVorticity, vUv + vec2(uTexelSize.x, 0.0)).r);
  float B = abs(texture2D(uVorticity, vUv - vec2(0.0, uTexelSize.y)).r);
  float T = abs(texture2D(uVorticity, vUv + vec2(0.0, uTexelSize.y)).r);
  float C = texture2D(uVorticity, vUv).r;

  vec2 force = 0.5 * vec2(R - L, T - B);
  float len = length(force) + 1e-5;
  vec2 N = force / len;

  vec2 curlForce = vec2(N.y, -N.x) * C * uCurlStrength;

  vec2 vel = texture2D(uVelocity, vUv).xy;
  vel += curlForce * uDt;

  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

// 5. Divergence Shader
const divergenceShader = `
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;

  float div = 0.5 * ((R - L) + (T - B));
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

// 6. Jacobi Pressure Poisson Solver Shader
const jacobiShader = `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).r;
  float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).r;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).r;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).r;
  float div = texture2D(uDivergence, vUv).r;

  float p = (L + R + B + T - div) * 0.25;
  gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
}
`;

// 7. Gradient Subtraction / Projection Shader
const gradientSubtractShader = `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).r;
  float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).r;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).r;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).r;

  vec2 vel = texture2D(uVelocity, vUv).xy;
  vel -= 0.5 * vec2(R - L, T - B);

  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

// 8. The Progressive Pigment State Shader (P_n = P_{n-1} + music + randomness)
const pigmentEvolutionShader = `
uniform sampler2D uPigment;       // P_{n-1} (living accumulated state)
uniform sampler2D uBasePainting;  // P_0 (original pristine painting WebP)
uniform sampler2D uVelocity;      // Navier-Stokes physical velocity field
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uPigmentSpread;
uniform float uColorShift;
uniform float uActivity;
uniform float uDetail;
uniform float uAnchorFactor;
uniform float uDissolveMode;     // 1.0 = Dissolve Mode, 0.0 = Non-Dissolve Mode
uniform float uWarp;
uniform float uDisplacement;
uniform float uZoom;             // Subtle smooth zoom factor (1.000 to ~1.055)
uniform vec2 uDreamyFloat;       // Airy floating micro-drift offset
uniform float uDreamyGlow;       // Airy dreamy luminescence and bloom factor

varying vec2 vUv;

void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;

  if (uDissolveMode > 0.5) {
    // ------------------------------------------------------------------
    // DISSOLVE MODE (Current State)
    // Progressive Navier-Stokes UV advection, Laplacian bleeding diffusion,
    // chromatic agitation mixing, and organic pigment dissolution
    // ------------------------------------------------------------------
    vec2 advectCoord = vUv - vel * uDt * 0.45;
    advectCoord = clamp(advectCoord, vec2(0.001), vec2(0.999));
    vec4 prevP = texture2D(uPigment, advectCoord);

    // 2. Physical Pigment Bleeding & Diffusion (5-tap Laplacian filter)
    vec4 pL = texture2D(uPigment, advectCoord - vec2(uTexelSize.x, 0.0));
    vec4 pR = texture2D(uPigment, advectCoord + vec2(uTexelSize.x, 0.0));
    vec4 pB = texture2D(uPigment, advectCoord - vec2(0.0, uTexelSize.y));
    vec4 pT = texture2D(uPigment, advectCoord + vec2(0.0, uTexelSize.y));

    vec4 laplacian = (pL + pR + pB + pT - 4.0 * prevP);
    float bleedRate = clamp(uPigmentSpread * 0.22, 0.008, 0.3);
    vec4 diffused = prevP + laplacian * bleedRate;

    // 3. Color Mixing & Bleed Tinting based on chromatic agitation
    if (uColorShift > 0.02) {
      float shift = uColorShift * 0.012;
      float r = texture2D(uPigment, advectCoord + vec2(shift, 0.0)).r;
      float g = diffused.g;
      float b = texture2D(uPigment, advectCoord - vec2(shift, 0.0)).b;
      diffused.rgb = mix(diffused.rgb, vec3(r, g, b), 0.3);
    }

    // 4. Pigment Accumulation & Density
    float speed = length(vel);
    diffused.a = clamp(diffused.a + (speed * 0.05 - 0.005) * uDt, 0.2, 2.0);

    // 5. Preservation Anchor: continuously blend lightly with P_0 to preserve
    // the artistic integrity, identity, and color hierarchy over continuous playback
    vec4 p0 = texture2D(uBasePainting, vUv);
    float anchor = clamp(uAnchorFactor, 0.0003, 0.003);
    vec4 nextP = mix(diffused, p0, anchor);
    nextP.a = 1.0;

    gl_FragColor = nextP;
  } else {
    // ------------------------------------------------------------------
    // NON-DISSOLVE MODE (Checkpoint with Timeline Interpolation Module)
    // Subtle smooth zoom in-out & airy dreamy feel while playing music
    // ------------------------------------------------------------------
    // 1. Subtle smooth zoom centered at (0.5, 0.5) with airy floating micro-drift
    float safeZoom = max(uZoom, 0.001);
    vec2 centeredUv = (vUv - vec2(0.5) - uDreamyFloat) / safeZoom + vec2(0.5);

    // 2. Dynamic acoustic wave offset driven by velocity & displacement
    vec2 dynamicOffset = vel * (0.012 + uWarp * 0.022 + uDisplacement * 0.016);
    vec2 coord = clamp(centeredUv - dynamicOffset, vec2(0.001), vec2(0.999));

    // 3. Pristine base painting sampling
    vec4 pristineCol = texture2D(uBasePainting, coord);

    // 4. Airy dreamy soft-focus luminescence & ethereal chromatic prism dispersion
    if (uDreamyGlow > 0.005) {
      vec2 spread = uTexelSize * (2.8 + uActivity * 2.0);
      float shift = 0.0025 * uDreamyGlow;

      // Multi-tap soft luminous bloom diffusion
      vec4 bloom = (
        texture2D(uBasePainting, clamp(coord + vec2(spread.x, spread.y), vec2(0.001), vec2(0.999))) +
        texture2D(uBasePainting, clamp(coord - vec2(spread.x, spread.y), vec2(0.001), vec2(0.999))) +
        texture2D(uBasePainting, clamp(coord + vec2(-spread.x, spread.y), vec2(0.001), vec2(0.999))) +
        texture2D(uBasePainting, clamp(coord + vec2(spread.x, -spread.y), vec2(0.001), vec2(0.999))) +
        texture2D(uBasePainting, clamp(coord + vec2(spread.x * 1.6, 0.0), vec2(0.001), vec2(0.999))) +
        texture2D(uBasePainting, clamp(coord - vec2(spread.x * 1.6, 0.0), vec2(0.001), vec2(0.999))) +
        texture2D(uBasePainting, clamp(coord + vec2(0.0, spread.y * 1.6), vec2(0.001), vec2(0.999))) +
        texture2D(uBasePainting, clamp(coord - vec2(0.0, spread.y * 1.6), vec2(0.001), vec2(0.999)))
      ) * 0.125;

      // Delicate airy chromatic prism shimmer (subtle anamorphic dream dispersion)
      float rChroma = texture2D(uBasePainting, clamp(coord + vec2(shift, 0.0), vec2(0.001), vec2(0.999))).r;
      float bChroma = texture2D(uBasePainting, clamp(coord - vec2(shift, 0.0), vec2(0.001), vec2(0.999))).b;
      vec3 prism = vec3(rChroma, bloom.g, bChroma);

      // Ethereal highlight bloom: gentle luminous halo on bright areas
      float lum = dot(pristineCol.rgb, vec3(0.299, 0.587, 0.114));
      float highlight = smoothstep(0.3, 0.85, lum);

      // Blend airy dream bloom and subtle prism luminescence
      vec3 softDream = mix(pristineCol.rgb, bloom.rgb, 0.16 * uDreamyGlow);
      vec3 luminousHighlight = prism * (0.22 * highlight + 0.05);

      pristineCol.rgb = softDream + luminousHighlight * uDreamyGlow;
    }

    gl_FragColor = vec4(pristineCol.rgb, 1.0);
  }
}
`;

// 9. Display Shader: Impasto relief, surface normals & wet specular sheen
const displayFragmentShader = `
uniform sampler2D uPigmentTexture;
uniform sampler2D uBaseTexture;
uniform vec2 uTexelSize;
uniform float uDetail;
uniform float uWarp;
uniform float uActivity;
uniform float uDissolveMode;
uniform float uDreamyGlow;
uniform float uTime;

varying vec2 vUv;

void main() {
  vec4 pigment = texture2D(uPigmentTexture, vUv);
  vec4 baseCol = texture2D(uBaseTexture, vUv);

  // Fallback to base texture if pigment render target is uninitialized
  if (pigment.a < 0.05 || dot(pigment.rgb, pigment.rgb) < 0.001) {
    pigment = baseCol;
  }

  // Impasto Normal Mapping: derive surface relief from pigment density / luminance gradient
  float L = dot(texture2D(uPigmentTexture, vUv - vec2(uTexelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float R = dot(texture2D(uPigmentTexture, vUv + vec2(uTexelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float B = dot(texture2D(uPigmentTexture, vUv - vec2(0.0, uTexelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
  float T = dot(texture2D(uPigmentTexture, vUv + vec2(0.0, uTexelSize.y)).rgb, vec3(0.299, 0.587, 0.114));

  float reliefScale = 1.0 + uDetail * 1.8;
  // In non-dissolve mode with airy dreamy feel, soften relief for a velvety canvas texture
  if (uDissolveMode < 0.5 && uDreamyGlow > 0.01) {
    reliefScale *= (1.0 - uDreamyGlow * 0.25);
  }
  vec3 normal = normalize(vec3((L - R) * reliefScale, (B - T) * reliefScale, 1.0));

  // Light source (overhead soft directional studio light)
  vec3 lightDir = normalize(vec3(0.3, 0.6, 0.75));
  float diffuse = max(dot(normal, lightDir), 0.0);

  // Wet oil paint specular highlight (sheen on thick brushstroke crests)
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal, halfDir), 0.0), 28.0);
  float wetSheen = spec * (0.12 + uActivity * 0.22);

  // Composite final base color
  vec3 color = pigment.rgb * (0.84 + diffuse * 0.2) + vec3(wetSheen);

  // Non-Dissolve Airy Dreamy enhancement:
  // Delicate soft ambient breathing and pearlescent silk sheen
  if (uDissolveMode < 0.5 && uDreamyGlow > 0.005) {
    float airyPulse = sin(uTime * 0.42) * 0.5 + 0.5;
    vec3 dreamyTint = vec3(0.98, 0.96, 1.02); // celestial soft tone
    float softHaze = (diffuse * 0.07 + wetSheen * 0.2 + airyPulse * 0.03) * uDreamyGlow;
    color = mix(color, color * dreamyTint + vec3(softHaze), uDreamyGlow * 0.35);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export class FluidMesh {
  /**
   * @param {THREE.Scene} scene - The Three.js scene
   * @param {string} [texturePath="/textures/default.webp"] - Initial base painting texture P_0
   * @param {THREE.WebGLRenderer} [renderer] - WebGL renderer instance
   */
  constructor(scene, texturePath = "/textures/default.webp", renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.simRes = 512; // 512x512 Navier-Stokes grid (smooth 60+ FPS performance)
    this.stochasticModel = new StochasticForceModel({ alpha: 0.35 });

    this.isInitialized = false;
    this.texturePath = texturePath;
    this.baseTexture = null;
    this.dissolveMode = true; // Default: Dissolve Mode (progressive pigment melting & bleeding)

    // Dynamic state for Non-Dissolve Mode: subtle smooth zoom in-out & airy dreamy feel
    this.currentZoom = 1.0;
    this.targetZoom = 1.0;
    this.currentDreamyGlow = 0.0;
    this.targetDreamyGlow = 0.0;
    this.currentDreamyFloat = new THREE.Vector2(0, 0);
    this.targetDreamyFloat = new THREE.Vector2(0, 0);

    // Internal simulation camera & full-screen quad scene
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.simCamera.position.set(0, 0, 1);
    this.simScene = new THREE.Scene();
    this.simQuadGeo = new THREE.PlaneGeometry(2, 2);
    this.simQuadMesh = new THREE.Mesh(this.simQuadGeo, null);
    this.simScene.add(this.simQuadMesh);

    // Create Ping-Pong Render Targets
    this._initRenderTargets();

    // Compile Simulation Materials
    this._initMaterials();

    // Main visible screen display mesh
    this.displayMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: displayFragmentShader,
      uniforms: {
        uPigmentTexture: { value: this.targetPigment.texture },
        uBaseTexture: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / this.simRes, 1 / this.simRes) },
        uDetail: { value: 0 },
        uWarp: { value: 0 },
        uActivity: { value: 0 },
        uDissolveMode: { value: this.dissolveMode ? 1.0 : 0.0 },
        uDreamyGlow: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      depthWrite: false,
      depthTest: false,
    });

    this.geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    this.mesh = new THREE.Mesh(this.geometry, this.displayMaterial);
    scene.add(this.mesh);

    // Load initial base texture P_0
    this.loadBasePainting(texturePath);
  }

  /**
   * Allocates high-precision Ping-Pong Render Targets.
   * Uses HalfFloatType for high dynamic range velocity & pigment advection.
   */
  _initRenderTargets() {
    const res = this.simRes;
    const rtOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      stencilBuffer: false,
      depthBuffer: false,
    };

    // Velocity field ping-pong
    this.velocityA = new THREE.WebGLRenderTarget(res, res, rtOptions);
    this.velocityB = new THREE.WebGLRenderTarget(res, res, rtOptions);

    // Pressure field ping-pong
    this.pressureA = new THREE.WebGLRenderTarget(res, res, rtOptions);
    this.pressureB = new THREE.WebGLRenderTarget(res, res, rtOptions);

    // Divergence and Vorticity fields
    this.divergenceRT = new THREE.WebGLRenderTarget(res, res, rtOptions);
    this.vorticityRT = new THREE.WebGLRenderTarget(res, res, rtOptions);

    // Living Pigment Canvas ping-pong (P_n progressive state)
    this.pigmentA = new THREE.WebGLRenderTarget(res, res, rtOptions);
    this.pigmentB = new THREE.WebGLRenderTarget(res, res, rtOptions);

    // Pointers for ping-pong swapping
    this.sourceVelocity = this.velocityA;
    this.targetVelocity = this.velocityB;

    this.sourcePressure = this.pressureA;
    this.targetPressure = this.pressureB;

    this.sourcePigment = this.pigmentA;
    this.targetPigment = this.pigmentB;
  }

  /**
   * Initializes all Navier-Stokes & Pigment evolution shader materials.
   */
  _initMaterials() {
    const texel = new THREE.Vector2(1 / this.simRes, 1 / this.simRes);

    this.matAdvect = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: advectionShader,
      uniforms: {
        uVelocity: { value: null },
        uSource: { value: null },
        uTexelSize: { value: texel },
        uDt: { value: 0.016 },
        uDissipation: { value: 0.985 },
        uSpeed: { value: 1.0 },
      },
      depthTest: false,
    });

    this.matForce = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: forceShader,
      uniforms: {
        uVelocity: { value: null },
        uTexelSize: { value: texel },
        uDt: { value: 0.016 },
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uTurbulence: { value: 0 },
        uDisplacement: { value: 0 },
        uWarp: { value: 0 },
        uActivity: { value: 0 },
        uNoiseIntensity: { value: 0.35 },
      },
      depthTest: false,
    });

    this.matVorticity = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: vorticityShader,
      uniforms: {
        uVelocity: { value: null },
        uTexelSize: { value: texel },
      },
      depthTest: false,
    });

    this.matVorticityForce = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: vorticityForceShader,
      uniforms: {
        uVelocity: { value: null },
        uVorticity: { value: null },
        uTexelSize: { value: texel },
        uDt: { value: 0.016 },
        uCurlStrength: { value: 18.0 },
      },
      depthTest: false,
    });

    this.matDivergence = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: divergenceShader,
      uniforms: {
        uVelocity: { value: null },
        uTexelSize: { value: texel },
      },
      depthTest: false,
    });

    this.matJacobi = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: jacobiShader,
      uniforms: {
        uPressure: { value: null },
        uDivergence: { value: null },
        uTexelSize: { value: texel },
      },
      depthTest: false,
    });

    this.matGradientSubtract = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: gradientSubtractShader,
      uniforms: {
        uPressure: { value: null },
        uVelocity: { value: null },
        uTexelSize: { value: texel },
      },
      depthTest: false,
    });

    this.matPigmentEvolution = new THREE.ShaderMaterial({
      vertexShader: baseVertexShader,
      fragmentShader: pigmentEvolutionShader,
      uniforms: {
        uPigment: { value: null },
        uBasePainting: { value: null },
        uVelocity: { value: null },
        uTexelSize: { value: texel },
        uDt: { value: 0.016 },
        uPigmentSpread: { value: 0.5 },
        uColorShift: { value: 0 },
        uActivity: { value: 0 },
        uDetail: { value: 0 },
        uAnchorFactor: { value: 0.001 },
        uDissolveMode: { value: this.dissolveMode ? 1.0 : 0.0 },
        uWarp: { value: 0 },
        uDisplacement: { value: 0 },
        uZoom: { value: 1.0 },
        uDreamyFloat: { value: new THREE.Vector2(0, 0) },
        uDreamyGlow: { value: 0.0 },
      },
      depthTest: false,
    });

    // Simple blit material for resetting/copying
    this.matCopy = new THREE.MeshBasicMaterial({ depthTest: false });
  }

  /**
   * Toggles between Dissolve Mode (progressive Navier-Stokes fluid bleeding)
   * and Non-Dissolve Mode (checkpoint mode with timeline interpolation module).
   * @param {boolean} enabled
   */
  setDissolveMode(enabled) {
    const next = Boolean(enabled);
    if (this.dissolveMode !== next) {
      this.dissolveMode = next;
      // Reset the progressive pigment canvas so that the chosen mode renders clean
      this.resetState();
    }
  }

  /**
   * Loads the base painting texture P_0.
   * Initializes both pigment buffers P_n = P_0.
   */
  loadBasePainting(path) {
    this.texturePath = path;
    new THREE.TextureLoader().load(
      path,
      (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        this.baseTexture = texture;
        this.resetState();
      },
      undefined,
      (err) => {
        console.warn("[FluidMesh] Failed to load base painting texture:", path, err);
      }
    );
  }

  /**
   * Resets the progressive state:
   * P_n = P_0 (Original pristine painting).
   * Clears velocity and pressure fields to zero.
   */
  resetState() {
    if (!this.renderer || !this.baseTexture) {
      return;
    }

    const prevRT = this.renderer.getRenderTarget();

    // Blit base painting into both pigment ping-pong targets (P_0)
    this.simQuadMesh.material = this.matCopy;
    this.matCopy.map = this.baseTexture;
    this.matCopy.needsUpdate = true;

    this.renderer.setRenderTarget(this.pigmentA);
    this.renderer.render(this.simScene, this.simCamera);

    this.renderer.setRenderTarget(this.pigmentB);
    this.renderer.render(this.simScene, this.simCamera);

    // Clear velocity and pressure fields
    this.renderer.setRenderTarget(this.velocityA);
    this.renderer.clearColor();
    this.renderer.setRenderTarget(this.velocityB);
    this.renderer.clearColor();
    this.renderer.setRenderTarget(this.pressureA);
    this.renderer.clearColor();
    this.renderer.setRenderTarget(this.pressureB);
    this.renderer.clearColor();

    this.renderer.setRenderTarget(prevRT);

    if (this.displayMaterial?.uniforms?.uBaseTexture) {
      this.displayMaterial.uniforms.uBaseTexture.value = this.baseTexture;
    }
    if (this.matPigmentEvolution?.uniforms?.uBasePainting) {
      this.matPigmentEvolution.uniforms.uBasePainting.value = this.baseTexture;
    }

    this.isInitialized = true;
  }

  /**
   * Helper to execute a single simulation quad render pass.
   */
  _renderPass(material, target) {
    this.renderer.setRenderTarget(target);
    this.simQuadMesh.material = material;
    this.renderer.render(this.simScene, this.simCamera);
  }

  /**
   * Executes one Navier-Stokes fluid step + Pigment Progressive Evolution pass.
   *
   * @param {Object} visual - Visual parameters (flow_strength, turbulence, etc.)
   * @param {number} time - Current continuous simulation time
   * @param {THREE.WebGLRenderer} [renderer] - Renderer instance
   * @param {Object|boolean} [options] - Dynamic playback options ({ isPlaying, reducedMotion })
   */
  update(visual, time, renderer = this.renderer, options = {}) {
    if (renderer && !this.renderer) {
      this.renderer = renderer;
    }

    const gl = this.renderer;
    if (!gl || !visual) {
      return;
    }

    if (!this.isInitialized && this.baseTexture) {
      this.resetState();
    }

    // Determine playback & motion status
    const isPlaying = typeof options === "boolean" ? options : Boolean(options?.isPlaying);
    const isReducedMotion = Boolean(options?.reducedMotion);

    // ------------------------------------------------------------------
    // NON-DISSOLVE MODE ONLY: Dynamic subtle smooth zoom in-out & airy dreamy feel
    // Active ONLY in non-dissolve mode and while playing music in background
    // ------------------------------------------------------------------
    if (!this.dissolveMode && isPlaying) {
      // 1. Subtle smooth zoom in-out
      // Serene, gentle breathing cycle (~13.5s period)
      const zoomAmp = isReducedMotion ? 0.02 : 0.052;
      const zoomBreath = 0.5 + 0.5 * Math.sin(time * 0.44);
      // Delicate acoustic resonance from timeline interpolation
      const acousticSwell = (visual.flow_strength || 0.5) * 0.008 + (visual.activity || 0.5) * 0.008;
      this.targetZoom = 1.0 + zoomBreath * zoomAmp + acousticSwell;

      // 2. Airy floating micro-drift (ethereal floating motion like viewing through morning mist)
      const driftAmp = isReducedMotion ? 0.0028 : 0.0072;
      this.targetDreamyFloat.set(
        Math.sin(time * 0.24) * driftAmp,
        Math.cos(time * 0.18) * (driftAmp * 0.8)
      );

      // 3. Airy dreamy luminescence & soft-focus bloom factor
      const glowBase = isReducedMotion ? 0.38 : 0.72;
      const glowBreath = 0.16 * Math.sin(time * 0.52);
      this.targetDreamyGlow = Math.min(1.0, Math.max(0.0, glowBase + glowBreath + (visual.displacement || 0.3) * 0.12));
    } else {
      // In Dissolve Mode, or when music is paused / stopped:
      // Smoothly glide back to standard framing and neutral rest state
      this.targetZoom = 1.0;
      this.targetDreamyFloat.set(0, 0);
      this.targetDreamyGlow = 0.0;
    }

    // Smooth exponential damping / glide
    const lerpRate = 0.042;
    this.currentZoom += (this.targetZoom - this.currentZoom) * lerpRate;
    this.currentDreamyFloat.lerp(this.targetDreamyFloat, lerpRate);
    this.currentDreamyGlow += (this.targetDreamyGlow - this.currentDreamyGlow) * lerpRate;

    const dt = 0.016; // Standard 60 FPS delta
    const prevRT = gl.getRenderTarget();

    /* ====================================================================
       PASS 1: Velocity Advection (Semi-Lagrangian)
       ==================================================================== */
    this.matAdvect.uniforms.uVelocity.value = this.sourceVelocity.texture;
    this.matAdvect.uniforms.uSource.value = this.sourceVelocity.texture;
    this.matAdvect.uniforms.uDt.value = dt;
    this.matAdvect.uniforms.uDissipation.value = 0.988;
    this.matAdvect.uniforms.uSpeed.value = 1.0;
    this._renderPass(this.matAdvect, this.targetVelocity);
    this._swapVelocity();

    /* ====================================================================
       PASS 2: External Musical Agitation & Stochastic Curl Forces
       ==================================================================== */
    this.matForce.uniforms.uVelocity.value = this.sourceVelocity.texture;
    this.matForce.uniforms.uDt.value = dt;
    this.matForce.uniforms.uTime.value = time;
    this.matForce.uniforms.uFlow.value = visual.flow_strength ?? 0;
    this.matForce.uniforms.uTurbulence.value = visual.turbulence ?? 0;
    this.matForce.uniforms.uDisplacement.value = visual.displacement ?? 0;
    this.matForce.uniforms.uWarp.value = visual.warp ?? 0;
    this.matForce.uniforms.uActivity.value = visual.activity ?? 0;
    this.matForce.uniforms.uNoiseIntensity.value = this.stochasticModel.getAlpha();
    this._renderPass(this.matForce, this.targetVelocity);
    this._swapVelocity();

    /* ====================================================================
       PASS 3: Vorticity Confinement (Preserves turbulent paint swirls)
       ==================================================================== */
    this.matVorticity.uniforms.uVelocity.value = this.sourceVelocity.texture;
    this._renderPass(this.matVorticity, this.vorticityRT);

    this.matVorticityForce.uniforms.uVelocity.value = this.sourceVelocity.texture;
    this.matVorticityForce.uniforms.uVorticity.value = this.vorticityRT.texture;
    this.matVorticityForce.uniforms.uDt.value = dt;
    this.matVorticityForce.uniforms.uCurlStrength.value = 14.0 + (visual.turbulence ?? 0) * 16.0;
    this._renderPass(this.matVorticityForce, this.targetVelocity);
    this._swapVelocity();

    /* ====================================================================
       PASS 4: Incompressibility (Divergence & Jacobi Pressure Solver)
       ==================================================================== */
    this.matDivergence.uniforms.uVelocity.value = this.sourceVelocity.texture;
    this._renderPass(this.matDivergence, this.divergenceRT);

    // 12 Jacobi relaxation iterations for smooth pressure resolution
    this.matJacobi.uniforms.uDivergence.value = this.divergenceRT.texture;
    for (let i = 0; i < 12; i++) {
      this.matJacobi.uniforms.uPressure.value = this.sourcePressure.texture;
      this._renderPass(this.matJacobi, this.targetPressure);
      this._swapPressure();
    }

    // Velocity Projection: v = v - grad(p)
    this.matGradientSubtract.uniforms.uPressure.value = this.sourcePressure.texture;
    this.matGradientSubtract.uniforms.uVelocity.value = this.sourceVelocity.texture;
    this._renderPass(this.matGradientSubtract, this.targetVelocity);
    this._swapVelocity();

    /* ====================================================================
       PASS 5: Progressive Pigment State Evolution (P_n = P_{n-1} + Music + Noise)
       ==================================================================== */
    this.matPigmentEvolution.uniforms.uPigment.value = this.sourcePigment.texture;
    this.matPigmentEvolution.uniforms.uBasePainting.value = this.baseTexture || this.sourcePigment.texture;
    this.matPigmentEvolution.uniforms.uVelocity.value = this.sourceVelocity.texture;
    this.matPigmentEvolution.uniforms.uDt.value = dt;
    this.matPigmentEvolution.uniforms.uPigmentSpread.value = visual.pigment_spread ?? 0.5;
    this.matPigmentEvolution.uniforms.uColorShift.value = visual.color_shift ?? 0;
    this.matPigmentEvolution.uniforms.uActivity.value = visual.activity ?? 0;
    this.matPigmentEvolution.uniforms.uDetail.value = visual.detail ?? 0;
    this.matPigmentEvolution.uniforms.uAnchorFactor.value = 0.001; // subtle anchor to preserve base painting identity
    this.matPigmentEvolution.uniforms.uDissolveMode.value = this.dissolveMode ? 1.0 : 0.0;
    this.matPigmentEvolution.uniforms.uWarp.value = visual.warp ?? 0;
    this.matPigmentEvolution.uniforms.uDisplacement.value = visual.displacement ?? 0;
    this.matPigmentEvolution.uniforms.uZoom.value = this.currentZoom;
    this.matPigmentEvolution.uniforms.uDreamyFloat.value.copy(this.currentDreamyFloat);
    this.matPigmentEvolution.uniforms.uDreamyGlow.value = this.currentDreamyGlow;

    this._renderPass(this.matPigmentEvolution, this.targetPigment);
    this._swapPigment();

    // Restore render target back to main viewport
    gl.setRenderTarget(prevRT);

    /* ====================================================================
       PASS 6: Update Screen Mesh Uniforms
       ==================================================================== */
    const u = this.displayMaterial.uniforms;
    u.uPigmentTexture.value = this.sourcePigment.texture;
    u.uDetail.value = visual.detail ?? 0;
    u.uWarp.value = visual.warp ?? 0;
    u.uActivity.value = visual.activity ?? 0;
    u.uDissolveMode.value = this.dissolveMode ? 1.0 : 0.0;
    u.uDreamyGlow.value = this.currentDreamyGlow;
    u.uTime.value = time;
  }

  _swapVelocity() {
    const tmp = this.sourceVelocity;
    this.sourceVelocity = this.targetVelocity;
    this.targetVelocity = tmp;
  }

  _swapPressure() {
    const tmp = this.sourcePressure;
    this.sourcePressure = this.targetPressure;
    this.targetPressure = tmp;
  }

  _swapPigment() {
    const tmp = this.sourcePigment;
    this.sourcePigment = this.targetPigment;
    this.targetPigment = tmp;
  }

  /**
   * Switches to a new base painting and re-initializes P_0.
   */
  setTexture(path) {
    this.loadBasePainting(path);
  }

  resize(width, height) {
    // Dynamic aspect-ratio adaptation
    if (this.geometry) {
      const aspect = width / (height || 1);
      this.mesh.scale.set(aspect > 1 ? aspect : 1, aspect < 1 ? 1 / aspect : 1, 1);
    }
  }

  dispose() {
    this.geometry?.dispose();
    this.displayMaterial?.dispose();
    this.simQuadGeo?.dispose();
    this.baseTexture?.dispose();

    this.velocityA?.dispose();
    this.velocityB?.dispose();
    this.pressureA?.dispose();
    this.pressureB?.dispose();
    this.divergenceRT?.dispose();
    this.vorticityRT?.dispose();
    this.pigmentA?.dispose();
    this.pigmentB?.dispose();

    this.matAdvect?.dispose();
    this.matForce?.dispose();
    this.matVorticity?.dispose();
    this.matVorticityForce?.dispose();
    this.matDivergence?.dispose();
    this.matJacobi?.dispose();
    this.matGradientSubtract?.dispose();
    this.matPigmentEvolution?.dispose();
    this.matCopy?.dispose();
  }
}
