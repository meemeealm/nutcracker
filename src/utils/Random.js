/**
 * Nutcracker — Fluid Canvas
 * Core Randomness, Noise Generation, Stochastic Force Blending & Math Safety Utilities
 *
 * Designed for high-frequency (60+ FPS) WebGL simulation loops:
 * - Reproducible seedable PRNG (Mulberry32)
 * - 2D & 3D continuous gradient noise and curl noise
 * - Stochastic Force Model: F(t) = F_ML(t) + alpha * F_noise(t)
 * - Safe parameter clamping & delta-time spike prevention
 * - Pre-allocated scratch vectors to eliminate garbage collection pressure
 */

/* ==========================================================================
   1. Pre-allocated Scratch Objects (Zero-GC in Inner Loops)
   ========================================================================== */

const _scratchVec2A = { x: 0, y: 0 };
const _scratchVec2B = { x: 0, y: 0 };
const _scratchVec3 = { x: 0, y: 0, z: 0 };
const _scratchVisualParams = {
  flow_strength: 0,
  turbulence: 0,
  pigment_spread: 0,
  displacement: 0,
  warp: 0,
  color_shift: 0,
  detail: 0,
  activity: 0,
};

/* ==========================================================================
   2. Reproducible Seedable PRNG (Mulberry32) & Noise Engine
   ========================================================================== */

export class RandomSource {
  /**
   * @param {number} [seed] - 32-bit unsigned integer seed. If omitted, uses crypto/random seed.
   */
  constructor(seed) {
    this._initialSeed = 0;
    this._state = 0;
    this._perm = new Uint8Array(512);
    this._grad3 = [
      1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
      1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
      0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
    ];

    const resolvedSeed =
      typeof seed === "number" && Number.isFinite(seed)
        ? seed >>> 0
        : (Math.random() * 0xffffffff) >>> 0;

    this.setSeed(resolvedSeed);
  }

  /**
   * Re-seeds the PRNG and regenerates the noise permutation tables.
   * @param {number} seed
   */
  setSeed(seed) {
    this._initialSeed = (seed >>> 0);
    this._state = this._initialSeed;
    this._initPermutationTable();
  }

  /**
   * Returns the initial seed configured for this generator.
   * @returns {number}
   */
  getSeed() {
    return this._initialSeed;
  }

  /**
   * Mulberry32 algorithm: Fast, high-quality 32-bit PRNG.
   * Returns a float in the half-open range [0, 1).
   * @returns {number}
   */
  next() {
    let s = (this._state += 0x6d2b79f5);
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a float in the range [min, max).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextRange(min, max) {
    return min + (max - min) * this.next();
  }

  /**
   * Generates an integer in the closed range [min, max].
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(lo + this.next() * (hi - lo + 1));
  }

  /**
   * Generates a centered random jitter value in [-amount, amount].
   * @param {number} amount
   * @returns {number}
   */
  jitter(amount) {
    return (this.next() * 2 - 1) * amount;
  }

  /**
   * Generates a uniformly distributed 2D unit direction vector.
   * @param {{ x: number, y: number }} [out] - Optional destination vector to avoid GC allocation.
   * @returns {{ x: number, y: number }}
   */
  direction(out = { x: 0, y: 0 }) {
    const angle = this.next() * Math.PI * 2;
    out.x = Math.cos(angle);
    out.y = Math.sin(angle);
    return out;
  }

  /**
   * Generates a uniformly distributed 3D unit direction vector.
   * @param {{ x: number, y: number, z: number }} [out] - Optional destination vector.
   * @returns {{ x: number, y: number, z: number }}
   */
  direction3D(out = { x: 0, y: 0, z: 0 }) {
    const z = this.nextRange(-1, 1);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = this.next() * Math.PI * 2;
    out.x = r * Math.cos(phi);
    out.y = r * Math.sin(phi);
    out.z = z;
    return out;
  }

  /* ---------------- Noise Permutation & Gradients ---------------- */

  _initPermutationTable() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }

    // Fisher-Yates shuffle using internal PRNG
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }

    // Duplicate for fast wrapping without modulo in noise loop
    for (let i = 0; i < 256; i++) {
      this._perm[i] = p[i];
      this._perm[i + 256] = p[i];
    }
  }

  /**
   * 2D smooth gradient Perlin noise in range [-1, 1].
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    const A = this._perm[X] + Y;
    const B = this._perm[X + 1] + Y;

    const g00 = this._dot2D(this._perm[A], xf, yf);
    const g10 = this._dot2D(this._perm[B], xf - 1, yf);
    const g01 = this._dot2D(this._perm[A + 1], xf, yf - 1);
    const g11 = this._dot2D(this._perm[B + 1], xf - 1, yf - 1);

    const x1 = g00 + u * (g10 - g00);
    const x2 = g01 + u * (g11 - g01);

    return x1 + v * (x2 - x1);
  }

  /**
   * 3D smooth gradient Perlin noise in range [-1, 1].
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);

    const A = this._perm[X] + Y;
    const AA = this._perm[A] + Z;
    const AB = this._perm[A + 1] + Z;
    const B = this._perm[X + 1] + Y;
    const BA = this._perm[B] + Z;
    const BB = this._perm[B + 1] + Z;

    const g000 = this._dot3D(this._perm[AA], xf, yf, zf);
    const g100 = this._dot3D(this._perm[BA], xf - 1, yf, zf);
    const g010 = this._dot3D(this._perm[AB], xf, yf - 1, zf);
    const g110 = this._dot3D(this._perm[BB], xf - 1, yf - 1, zf);
    const g001 = this._dot3D(this._perm[AA + 1], xf, yf, zf - 1);
    const g101 = this._dot3D(this._perm[BA + 1], xf - 1, yf, zf - 1);
    const g011 = this._dot3D(this._perm[AB + 1], xf, yf - 1, zf - 1);
    const g111 = this._dot3D(this._perm[BB + 1], xf - 1, yf - 1, zf - 1);

    const x1 = g000 + u * (g100 - g000);
    const x2 = g010 + u * (g110 - g010);
    const y1 = x1 + v * (x2 - x1);

    const x3 = g001 + u * (g101 - g001);
    const x4 = g011 + u * (g111 - g011);
    const y2 = x3 + v * (x4 - x3);

    return y1 + w * (y2 - y1);
  }

  /**
   * Evaluates 2D Curl Noise: (dPsi/dy, -dPsi/dx).
   * Generates divergence-free velocity vectors ideal for fluid swirls and vortices.
   *
   * @param {number} x - Spatial X coordinate
   * @param {number} y - Spatial Y coordinate
   * @param {number} t - Time coordinate
   * @param {{ x: number, y: number }} [out] - Optional destination vector
   * @param {number} [eps=0.01] - Finite difference step
   * @returns {{ x: number, y: number }}
   */
  curlNoise2D(x, y, t, out = { x: 0, y: 0 }, eps = 0.01) {
    const inv2Eps = 1 / (2 * eps);
    const nY1 = this.noise3D(x, y + eps, t);
    const nY0 = this.noise3D(x, y - eps, t);
    const nX1 = this.noise3D(x + eps, y, t);
    const nX0 = this.noise3D(x - eps, y, t);

    // curl = (dNoise/dy, -dNoise/dx)
    out.x = (nY1 - nY0) * inv2Eps;
    out.y = -(nX1 - nX0) * inv2Eps;
    return out;
  }

  _dot2D(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  _dot3D(hash, x, y, z) {
    const h = (hash & 15) * 3;
    return (
      this._grad3[h] * x +
      this._grad3[h + 1] * y +
      this._grad3[h + 2] * z
    );
  }
}

/** Default global shared instance */
export const random = new RandomSource();

/* Convenient bound global helpers */
export const next = () => random.next();
export const nextRange = (min, max) => random.nextRange(min, max);
export const nextInt = (min, max) => random.nextInt(min, max);
export const jitter = (amount) => random.jitter(amount);
export const direction = (out) => random.direction(out);
export const direction3D = (out) => random.direction3D(out);
export const noise2D = (x, y) => random.noise2D(x, y);
export const noise3D = (x, y, z) => random.noise3D(x, y, z);
export const curlNoise2D = (x, y, t, out, eps) =>
  random.curlNoise2D(x, y, t, out, eps);

/* ==========================================================================
   3. Stochastic Force Model: F(t) = F_ML(t) + alpha * F_noise(t)
   ========================================================================== */

export class StochasticForceModel {
  /**
   * @param {Object} [options]
   * @param {number} [options.alpha=0.35] - Randomness intensity parameter [0, 1]
   * @param {number} [options.spatialFrequency=1.2] - Noise spatial scale
   * @param {number} [options.temporalFrequency=0.6] - Noise temporal rate
   * @param {RandomSource} [options.randomSource] - PRNG / noise source
   */
  constructor({
    alpha = 0.35,
    spatialFrequency = 1.2,
    temporalFrequency = 0.6,
    randomSource = random,
  } = {}) {
    this.alpha = clamp(alpha, 0, 1);
    this.spatialFrequency = spatialFrequency;
    this.temporalFrequency = temporalFrequency;
    this.randomSource = randomSource;
  }

  /**
   * Sets the randomness intensity parameter alpha.
   * @param {number} alpha - In range [0, 1]
   */
  setAlpha(alpha) {
    this.alpha = clamp(alpha, 0, 1);
  }

  /**
   * Gets current randomness intensity parameter alpha.
   * @returns {number}
   */
  getAlpha() {
    return this.alpha;
  }

  /**
   * Computes the turbulent stochastic field force F_noise(t) at coordinates (x, y, t).
   * Uses curl noise to ensure realistic divergence-free fluid vortices.
   *
   * @param {number} x - Normalized canvas X coordinate [-1, 1]
   * @param {number} y - Normalized canvas Y coordinate [-1, 1]
   * @param {number} t - Audio / simulation elapsed time in seconds
   * @param {{ x: number, y: number }} [out] - Destination vector to avoid allocations
   * @returns {{ x: number, y: number }}
   */
  computeNoiseForce(x, y, t, out = { x: 0, y: 0 }) {
    const sx = x * this.spatialFrequency;
    const sy = y * this.spatialFrequency;
    const st = t * this.temporalFrequency;

    return this.randomSource.curlNoise2D(sx, sy, st, out);
  }

  /**
   * Directly blends deterministic musical force and stochastic noise force:
   *   F(t) = F_ML(t) + alpha * F_noise(t)
   *
   * @param {{ x: number, y: number }} fML - Deterministic musical force vector
   * @param {{ x: number, y: number }} fNoise - Stochastic field force vector
   * @param {number} [alpha=this.alpha] - Blend intensity
   * @param {{ x: number, y: number }} [out] - Destination vector to avoid allocations
   * @returns {{ x: number, y: number }}
   */
  blend(fML, fNoise, alpha = this.alpha, out = { x: 0, y: 0 }) {
    const effectiveAlpha = clamp(alpha, 0, 1);
    out.x = (fML?.x ?? 0) + effectiveAlpha * (fNoise?.x ?? 0);
    out.y = (fML?.y ?? 0) + effectiveAlpha * (fNoise?.y ?? 0);
    return out;
  }

  /**
   * Evaluates the full force equation at (x, y, t):
   *   F(t) = F_ML(t) + alpha * F_noise(x, y, t)
   *
   * @param {{ x: number, y: number }} fML - Deterministic musical force vector
   * @param {number} x - Normalized X coordinate
   * @param {number} y - Normalized Y coordinate
   * @param {number} t - Simulation time
   * @param {number} [alpha=this.alpha] - Stochastic intensity override
   * @param {{ x: number, y: number }} [out] - Destination vector
   * @returns {{ x: number, y: number }}
   */
  evaluate(fML, x, y, t, alpha = this.alpha, out = { x: 0, y: 0 }) {
    this.computeNoiseForce(x, y, t, _scratchVec2A);
    return this.blend(fML, _scratchVec2A, alpha, out);
  }
}

/**
 * Functional helper to blend two force vectors:
 *   F(t) = F_ML(t) + alpha * F_noise(t)
 *
 * @param {{ x: number, y: number }} fML
 * @param {{ x: number, y: number }} fNoise
 * @param {number} [alpha=0.35]
 * @param {{ x: number, y: number }} [out]
 * @returns {{ x: number, y: number }}
 */
export function blendForces(fML, fNoise, alpha = 0.35, out = { x: 0, y: 0 }) {
  const a = clamp(alpha, 0, 1);
  out.x = (fML?.x ?? 0) + a * (fNoise?.x ?? 0);
  out.y = (fML?.y ?? 0) + a * (fNoise?.y ?? 0);
  return out;
}

/* ==========================================================================
   4. Math & Safety Utilities
   ========================================================================== */

/**
 * Clamps a number between min and max bounds.
 * Handles NaN/undefined gracefully by falling back to min.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return min;
  }
  return value < min ? min : value > max ? max : value;
}

/**
 * Maps a value from [inMin, inMax] to [outMin, outMax].
 *
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @param {boolean} [clampResult=false]
 * @returns {number}
 */
export function mapRange(value, inMin, inMax, outMin, outMax, clampResult = false) {
  if (inMax === inMin) return outMin;
  const normalized = (value - inMin) / (inMax - inMin);
  const result = outMin + normalized * (outMax - outMin);
  return clampResult ? clamp(result, Math.min(outMin, outMax), Math.max(outMin, outMax)) : result;
}

/**
 * Standard linear interpolation between a and b.
 * @param {number} a
 * @param {number} b
 * @param {number} t - Interpolant in [0, 1]
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Hermite smoothstep interpolation between edge0 and edge1.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number}
 */
export function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Validates and clamps visual parameters from the ML timeline / neural model
 * into safe simulation bounds before passing them to the GPU shaders.
 *
 * Bounds enforced:
 * - flow_strength: [-1.0, 1.0] (supports bidirectional flow currents)
 * - turbulence: [0.0, 1.0]
 * - pigment_spread: [0.0, 1.0]
 * - displacement: [0.0, 1.0]
 * - warp: [0.0, 1.0]
 * - color_shift: [0.0, 1.0]
 * - detail: [0.0, 1.0]
 * - activity: [0.0, 1.0]
 *
 * @param {Object} params - Raw parameters from ML prediction or timeline JSON
 * @param {Object} [out] - Destination object to avoid garbage collection
 * @returns {Object}
 */
export function clampVisualParameters(params, out = _scratchVisualParams) {
  if (!params) return out;

  out.flow_strength = clamp(Number(params.flow_strength ?? 0), -1.0, 1.0);
  out.turbulence = clamp(Number(params.turbulence ?? 0), 0.0, 1.0);
  out.pigment_spread = clamp(Number(params.pigment_spread ?? 0), 0.0, 1.0);
  out.displacement = clamp(Number(params.displacement ?? 0), 0.0, 1.0);
  out.warp = clamp(Number(params.warp ?? 0), 0.0, 1.0);
  out.color_shift = clamp(Number(params.color_shift ?? 0), 0.0, 1.0);
  out.detail = clamp(Number(params.detail ?? 0), 0.0, 1.0);
  out.activity = clamp(Number(params.activity ?? 0), 0.0, 1.0);

  return out;
}

/**
 * Clamps delta time to prevent physics simulation blowups or large vertex
 * spikes when a browser tab is minimized or backgrounded.
 *
 * @param {number} dt - Raw delta time in seconds
 * @param {number} [maxDt=0.05] - Upper bound (default: 50ms = 20 FPS threshold)
 * @param {number} [minDt=0.0001] - Lower bound to prevent division by zero
 * @returns {number}
 */
export function clampDeltaTime(dt, maxDt = 0.05, minDt = 0.0001) {
  if (typeof dt !== "number" || Number.isNaN(dt) || dt <= 0) {
    return 1 / 60; // 16.6ms fallback for first frame or invalid values
  }
  return clamp(dt, minDt, maxDt);
}

/**
 * Delta time tracker that maintains smooth frame pacing across browser tabs.
 */
export class DeltaTimeManager {
  /**
   * @param {number} [maxDeltaSeconds=0.05]
   */
  constructor(maxDeltaSeconds = 0.05) {
    this.maxDeltaSeconds = maxDeltaSeconds;
    this.lastTime = 0;
  }

  /**
   * Resets the timer state.
   */
  reset() {
    this.lastTime = 0;
  }

  /**
   * Updates and returns a safely clamped delta time in seconds.
   * @param {number} currentTimeSeconds - Performance.now() / 1000 or timestamp in seconds
   * @returns {number} Clamped delta time in seconds
   */
  update(currentTimeSeconds) {
    if (this.lastTime === 0) {
      this.lastTime = currentTimeSeconds;
      return 1 / 60;
    }

    const rawDelta = currentTimeSeconds - this.lastTime;
    this.lastTime = currentTimeSeconds;

    return clampDeltaTime(rawDelta, this.maxDeltaSeconds);
  }
}
