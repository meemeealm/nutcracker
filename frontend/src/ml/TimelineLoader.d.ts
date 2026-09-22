import { VisualParameters } from '../types';

export interface TimelineLoaderOptions {
  trackId?: string;
  path?: string;
  defaultFps?: number;
}

export const VISUAL_KEYS: string[];

export class TimelineLoader {
  trackId: string | null;
  path: string | null;
  defaultFps: number;
  version: string;
  fps: number;
  dimensions: number;
  frameCount: number;
  duration: number;
  isLoaded: boolean;
  isLoading: boolean;

  constructor(options?: TimelineLoaderOptions);

  load(trackIdOrPath?: string): Promise<TimelineLoader>;

  getVectorAtTime(audioTime: number, out?: Float32Array | number[]): Float32Array | number[];

  getVisualState(audioTime: number, out?: VisualParameters): VisualParameters;

  static lerp(a: number, b: number, alpha: number): number;

  dispose(): void;
}
