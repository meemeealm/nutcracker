import * as THREE from 'three';
import { VisualParameters } from '../types';

export class FluidMesh {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer | null;
  simRes: number;
  texturePath: string;
  baseTexture: THREE.Texture | null;
  dissolveMode: boolean;
  mesh: THREE.Mesh;
  geometry: THREE.PlaneGeometry;
  displayMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, texturePath?: string, renderer?: THREE.WebGLRenderer | null);

  loadBasePainting(path: string): void;

  setDissolveMode(enabled: boolean): void;

  resetState(): void;

  update(
    visual: VisualParameters,
    time: number,
    renderer?: THREE.WebGLRenderer | null,
    options?: { isPlaying?: boolean; reducedMotion?: boolean } | boolean
  ): void;

  setTexture(path: string): void;

  resize(width: number, height: number): void;

  dispose(): void;
}
