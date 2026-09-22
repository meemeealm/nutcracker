import { load } from 'js-yaml';
import rawYaml from './ml_config.yaml?raw';

export interface SongConfig {
  title?: string;
  artist?: string;
  model_path?: string;
  features_path?: string;
  mood?: string;
}

export interface MLEngineConfig {
  default_model_path: string;
  model_format: 'auto' | 'graph' | 'layers';
  inference_throttle_ms: number;
  interpolation: {
    enabled: boolean;
    lerp_factor: number;
  };
}

export interface RenderingConfig {
  mesh_resolution: number;
  plane_size: number;
  default_texture: string;
}

export interface AppConfig {
  version: string;
  ml_engine: MLEngineConfig;
  rendering: RenderingConfig;
  songs: Record<string, SongConfig>;
}

// Parse YAML on module load
let parsedConfig: AppConfig;
try {
  parsedConfig = load(rawYaml) as AppConfig;
} catch (err) {
  console.error('[Config] Failed to parse ml_config.yaml, falling back to defaults:', err);
  parsedConfig = {
    version: '1.0',
    ml_engine: {
      default_model_path: '/ml/browser/model.json',
      model_format: 'auto',
      inference_throttle_ms: 45,
      interpolation: {
        enabled: true,
        lerp_factor: 0.12,
      },
    },
    rendering: {
      mesh_resolution: 128,
      plane_size: 8.0,
      default_texture: '/textures/default.webp',
    },
    songs: {
      'beyond-love': {
        title: 'Beyond Love',
        artist: 'Beach House',
        model_path: '/ml/browser/model.json',
        features_path: '/ml/beach_house.json',
      },
    },
  };
}

export const ML_CONFIG = parsedConfig;

/**
 * Returns configuration specific to a song/track ID.
 */
export function getSongConfig(trackId: string): SongConfig {
  const song = ML_CONFIG.songs?.[trackId];
  if (song) return song;

  return {
    model_path: ML_CONFIG.ml_engine.default_model_path,
  };
}

/**
 * Gets the configured model path for a track.
 */
export function getModelPathForTrack(trackId: string): string {
  const song = ML_CONFIG.songs?.[trackId];
  return song?.model_path || ML_CONFIG.ml_engine.default_model_path;
}

/**
 * Gets the configured features JSON path for a track.
 * Uses the JSON files in the public folder.
 */
export function getFeaturesPathForTrack(trackId: string, fallbackPath?: string): string {
  const song = ML_CONFIG.songs?.[trackId];
  return song?.features_path || fallbackPath || '/ml/beach_house.json';
}

/**
 * Smooth exponential linear interpolation between two parameter sets (60 FPS glide).
 */
export function lerpVisualParameters(
  current: {
    flow_strength: number;
    turbulence: number;
    pigment_spread: number;
    displacement: number;
    warp: number;
    color_shift: number;
    detail: number;
    activity: number;
  },
  target: {
    flow_strength: number;
    turbulence: number;
    pigment_spread: number;
    displacement: number;
    warp: number;
    color_shift: number;
    detail: number;
    activity: number;
  },
  alpha = ML_CONFIG.ml_engine.interpolation.lerp_factor
) {
  const lerp = (a: number, b: number) => a + (b - a) * alpha;

  return {
    flow_strength: lerp(current.flow_strength, target.flow_strength),
    turbulence: lerp(current.turbulence, target.turbulence),
    pigment_spread: lerp(current.pigment_spread, target.pigment_spread),
    displacement: lerp(current.displacement, target.displacement),
    warp: lerp(current.warp, target.warp),
    color_shift: lerp(current.color_shift, target.color_shift),
    detail: lerp(current.detail, target.detail),
    activity: lerp(current.activity, target.activity),
  };
}
