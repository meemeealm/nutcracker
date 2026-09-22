/**
 * Nutcracker — Fluid Canvas
 * Timeline-Level Sub-Frame Linear Interpolation (LERP) & Timeline Loader
 *
 * Implements sub-frame floating-point timeline sampling:
 *   exactFrame = audioTime * fps
 *   alpha = exactFrame - frameIndexA
 *   V(t) = (1 - alpha) * V[frameA] + alpha * V[frameB]
 *
 * Features:
 * - Loads timeline JSON using project config file mappings
 * - Contiguous Float32Array flattening for high CPU cache efficiency
 * - Zero Garbage Collection in high-frequency (60+ FPS) animation loops
 * - Supports arbitrary vector dimensions (16-dim, 8-dim) and target control schemas
 */

import { getFeaturesPathForTrack } from "@/config/index";

/** Standard 8 visual keys mapped from control vectors */
export const VISUAL_KEYS = [
  "flow_strength",
  "turbulence",
  "pigment_spread",
  "displacement",
  "warp",
  "color_shift",
  "detail",
  "activity",
];

export class TimelineLoader {
  /**
   * @param {Object} [options]
   * @param {string} [options.trackId] - Optional track identifier from config
   * @param {string} [options.path] - Explicit URL or path to timeline JSON
   * @param {number} [options.defaultFps=10] - Default sampling rate if omitted in JSON
   */
  constructor({ trackId, path, defaultFps = 10 } = {}) {
    this.trackId = trackId || null;
    this.path = path || (trackId ? getFeaturesPathForTrack(trackId) : null);
    this.defaultFps = defaultFps;

    // Timeline metadata
    this.version = "1.0";
    this.fps = defaultFps;
    this.dimensions = 16;
    this.frameCount = 0;
    this.duration = 0;
    this.isLoaded = false;
    this.isLoading = false;

    // High-performance flat buffer storage (zero per-frame GC)
    /** @type {Float32Array | null} */
    this._flatBuffer = null;

    // Pre-allocated reusable output buffers to prevent GC churn
    this._reusableVector = new Float32Array(16);
    this._reusableVisualState = {
      flow_strength: 0,
      turbulence: 0,
      pigment_spread: 0,
      displacement: 0,
      warp: 0,
      color_shift: 0,
      detail: 0,
      activity: 0,
    };
  }

  /**
   * Loads and parses a timeline JSON file.
   * Resolves paths via config or uses the explicit URL provided.
   *
   * @param {string} [trackIdOrPath] - Track ID (e.g., 'beyond-love') or direct path
   * @returns {Promise<TimelineLoader>}
   */
  async load(trackIdOrPath) {
    if (trackIdOrPath) {
      if (trackIdOrPath.includes("/") || trackIdOrPath.endsWith(".json")) {
        this.path = trackIdOrPath;
      } else {
        this.trackId = trackIdOrPath;
        this.path = getFeaturesPathForTrack(trackIdOrPath);
      }
    }

    if (!this.path) {
      throw new Error("[TimelineLoader] No valid trackId or path specified to load.");
    }

    this.isLoading = true;

    try {
      const response = await fetch(this.path);
      if (!response.ok) {
        throw new Error(
          `[TimelineLoader] Failed to fetch timeline (${response.status} ${response.statusText}): ${this.path}`
        );
      }

      const json = await response.json();
      this._parseTimelineJSON(json);
      this.isLoaded = true;
      return this;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Internal parser: normalizes incoming JSON variations (arrays, vectors, objects)
   * into a flat continuous Float32Array for maximum memory locality.
   *
   * Supports:
   * 1. Standard spec: { version, trackId, fps: 10, dimensions: 16, frames: [{ t, v: [...] }] }
   * 2. Semantic target spec: { frames: [{ time, target: { flow_strength, ... } }] }
   * 3. Feature array spec: { frames: [{ time, features: [...] }] }
   *
   * @private
   * @param {any} json
   */
  _parseTimelineJSON(json) {
    if (!json || !Array.isArray(json.frames) || json.frames.length === 0) {
      throw new Error("[TimelineLoader] Invalid timeline JSON: missing or empty frames array.");
    }

    this.version = String(json.version || json.schema_version || "1.0");
    this.trackId = String(json.trackId || this.trackId || "");

    // Determine FPS (default: 10, or derived from hop_seconds)
    const hopSeconds = json.analysis?.hop_seconds;
    this.fps = Number(
      json.fps || (hopSeconds && hopSeconds > 0 ? 1 / hopSeconds : this.defaultFps)
    );
    if (!Number.isFinite(this.fps) || this.fps <= 0) {
      this.fps = this.defaultFps;
    }

    const rawFrames = json.frames;
    this.frameCount = rawFrames.length;

    // Detect dimensionality
    const firstFrame = rawFrames[0];
    let detectedDim = 16;

    if (Number.isFinite(json.dimensions) && json.dimensions > 0) {
      detectedDim = json.dimensions;
    } else if (Array.isArray(firstFrame.v)) {
      detectedDim = firstFrame.v.length;
    } else if (Array.isArray(firstFrame.vector)) {
      detectedDim = firstFrame.vector.length;
    } else if (Array.isArray(firstFrame.features)) {
      detectedDim = firstFrame.features.length;
    } else if (firstFrame.target && typeof firstFrame.target === "object") {
      detectedDim = Math.max(8, Object.keys(firstFrame.target).length);
    }

    this.dimensions = detectedDim;

    // Allocate continuous Float32Array for all frames
    const totalElements = this.frameCount * this.dimensions;
    this._flatBuffer = new Float32Array(totalElements);

    // Populate the flat buffer
    for (let i = 0; i < this.frameCount; i++) {
      const f = rawFrames[i];
      const offset = i * this.dimensions;

      if (Array.isArray(f.v)) {
        for (let d = 0; d < this.dimensions; d++) {
          this._flatBuffer[offset + d] = Number(f.v[d] ?? 0);
        }
      } else if (Array.isArray(f.vector)) {
        for (let d = 0; d < this.dimensions; d++) {
          this._flatBuffer[offset + d] = Number(f.vector[d] ?? 0);
        }
      } else if (Array.isArray(f.features)) {
        for (let d = 0; d < this.dimensions; d++) {
          this._flatBuffer[offset + d] = Number(f.features[d] ?? 0);
        }
      } else if (f.target && typeof f.target === "object") {
        for (let d = 0; d < VISUAL_KEYS.length && d < this.dimensions; d++) {
          const key = VISUAL_KEYS[d];
          this._flatBuffer[offset + d] = Number(f.target[key] ?? 0);
        }
      } else if (Array.isArray(f)) {
        for (let d = 0; d < this.dimensions; d++) {
          this._flatBuffer[offset + d] = Number(f[d] ?? 0);
        }
      }
    }

    // Allocate matching reusable vector
    this._reusableVector = new Float32Array(this.dimensions);

    // Compute total duration
    const lastFrame = rawFrames[this.frameCount - 1];
    const lastTime = Number(lastFrame.t ?? lastFrame.time ?? 0);
    this.duration =
      lastTime > 0 ? lastTime : (this.frameCount - 1) / this.fps;
  }

  /**
   * Performs timeline-level sub-frame linear interpolation (LERP)
   * across all values in the vector at a continuous audio timestamp.
   *
   * Formula:
   *   exactFrame = audioTime * fps
   *   alpha = exactFrame - frameIndexA
   *   V(t) = A + alpha * (B - A)
   *
   * @param {number} audioTime - Current playback time in seconds
   * @param {Float32Array | number[]} [out] - Optional pre-allocated destination buffer (Zero-GC)
   * @returns {Float32Array | number[]} Interpolated values array
   */
  getVectorAtTime(audioTime, out = this._reusableVector) {
    if (!this.isLoaded || !this._flatBuffer || this.frameCount === 0) {
      if (out) out.fill?.(0);
      return out;
    }

    const t = typeof audioTime === "number" && Number.isFinite(audioTime) ? audioTime : 0;

    // Edge case: Time <= 0
    if (t <= 0) {
      for (let d = 0; d < this.dimensions; d++) {
        out[d] = this._flatBuffer[d];
      }
      return out;
    }

    // Exact floating-point frame position
    const exactFrame = t * this.fps;

    // Edge case: Exceeds last frame
    if (exactFrame >= this.frameCount - 1) {
      const lastOffset = (this.frameCount - 1) * this.dimensions;
      for (let d = 0; d < this.dimensions; d++) {
        out[d] = this._flatBuffer[lastOffset + d];
      }
      return out;
    }

    // Identify neighboring frames
    const frameIndexA = Math.floor(exactFrame);
    const frameIndexB = frameIndexA + 1;

    // Fractional remainder alpha between 0.0 and 1.0
    const alpha = exactFrame - frameIndexA;

    const offsetA = frameIndexA * this.dimensions;
    const offsetB = frameIndexB * this.dimensions;

    // Sub-frame linear interpolation across all dimensions
    for (let d = 0; d < this.dimensions; d++) {
      const valA = this._flatBuffer[offsetA + d];
      const valB = this._flatBuffer[offsetB + d];
      out[d] = valA + alpha * (valB - valA);
    }

    return out;
  }

  /**
   * Retrieves the interpolated visual control state (flow_strength, turbulence, etc.)
   * at continuous audioTime, writing into a pre-allocated object to avoid garbage collection.
   *
   * @param {number} audioTime - Current audio time in seconds (e.g., audio.currentTime)
   * @param {Object} [out] - Optional destination object to avoid allocations
   * @returns {Object} Structured visual parameters
   */
  getVisualState(audioTime, out = this._reusableVisualState) {
    const vec = this.getVectorAtTime(audioTime, this._reusableVector);

    out.flow_strength = vec[0] ?? 0;
    out.turbulence = vec[1] ?? 0;
    out.pigment_spread = vec[2] ?? 0;
    out.displacement = vec[3] ?? 0;
    out.warp = vec[4] ?? 0;
    out.color_shift = vec[5] ?? 0;
    out.detail = vec[6] ?? 0;
    out.activity = vec[7] ?? 0;

    return out;
  }

  /**
   * Linear interpolation utility.
   * @param {number} a
   * @param {number} b
   * @param {number} alpha
   * @returns {number}
   */
  static lerp(a, b, alpha) {
    return a + alpha * (b - a);
  }

  /**
   * Disposes internal buffers and resets state.
   */
  dispose() {
    this._flatBuffer = null;
    this.frameCount = 0;
    this.isLoaded = false;
  }
}
