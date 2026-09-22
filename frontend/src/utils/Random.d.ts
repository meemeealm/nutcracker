import { VisualParameters } from '../types';

export interface Vector2D {
  x: number;
  y: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface StochasticForceOptions {
  alpha?: number;
  spatialFrequency?: number;
  temporalFrequency?: number;
  randomSource?: RandomSource;
}

export class RandomSource {
  constructor(seed?: number);
  setSeed(seed: number): void;
  getSeed(): number;
  next(): number;
  nextRange(min: number, max: number): number;
  nextInt(min: number, max: number): number;
  jitter(amount: number): number;
  direction(out?: Vector2D): Vector2D;
  direction3D(out?: Vector3D): Vector3D;
  noise2D(x: number, y: number): number;
  noise3D(x: number, y: number, z: number): number;
  curlNoise2D(x: number, y: number, t: number, out?: Vector2D, eps?: number): Vector2D;
}

export const random: RandomSource;
export function next(): number;
export function nextRange(min: number, max: number): number;
export function nextInt(min: number, max: number): number;
export function jitter(amount: number): number;
export function direction(out?: Vector2D): Vector2D;
export function direction3D(out?: Vector3D): Vector3D;
export function noise2D(x: number, y: number): number;
export function noise3D(x: number, y: number, z: number): number;
export function curlNoise2D(x: number, y: number, t: number, out?: Vector2D, eps?: number): Vector2D;

export class StochasticForceModel {
  alpha: number;
  spatialFrequency: number;
  temporalFrequency: number;
  randomSource: RandomSource;

  constructor(options?: StochasticForceOptions);
  setAlpha(alpha: number): void;
  getAlpha(): number;
  computeNoiseForce(x: number, y: number, t: number, out?: Vector2D): Vector2D;
  blend(fML: Vector2D, fNoise: Vector2D, alpha?: number, out?: Vector2D): Vector2D;
  evaluate(fML: Vector2D, x: number, y: number, t: number, alpha?: number, out?: Vector2D): Vector2D;
}

export function blendForces(
  fML: Vector2D,
  fNoise: Vector2D,
  alpha?: number,
  out?: Vector2D
): Vector2D;

export function clamp(value: number, min: number, max: number): number;
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  clampResult?: boolean
): number;
export function lerp(a: number, b: number, t: number): number;
export function smoothstep(edge0: number, edge1: number, x: number): number;
export function clampVisualParameters<T extends Partial<VisualParameters>>(
  params: T,
  out?: VisualParameters
): VisualParameters;
export function clampDeltaTime(dt: number, maxDt?: number, minDt?: number): number;

export class DeltaTimeManager {
  maxDeltaSeconds: number;
  lastTime: number;

  constructor(maxDeltaSeconds?: number);
  reset(): void;
  update(currentTimeSeconds: number): number;
}
