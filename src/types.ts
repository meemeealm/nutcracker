export interface VisualParameters {
  flow_strength: number;
  turbulence: number;
  pigment_spread: number;
  displacement: number;
  warp: number;
  color_shift: number;
  detail: number;
  activity: number;
}

export interface FeatureFrame {
  timestamp: number;
  features: number[];
}

export interface TrackMetadata {
  track: string;
  artist: string;
  duration: number;
  fps: number;
  feature_dim: number;
  frames: FeatureFrame[];
}

export type PlaybackStatus = 'unstarted' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export interface TrackOption {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  audioPath: string;
  featuresPath: string;
  description?: string;
}

export type ContrastType = 'high' | 'low';

export interface PaintingOption {
  id: string;
  title: string;
  artist: string;
  year?: string;
  contrast: ContrastType;
  texturePath: string;
  description: string;
  palette: string[];
  recommendedFor?: string;
}
