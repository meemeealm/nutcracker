import * as tf from "@tensorflow/tfjs";
import { ML_CONFIG } from "@/config/index";

export class ModelInference {
  /**
   * @param {string} [modelPath]
   */
  constructor(modelPath) {
    this.modelPath = modelPath || ML_CONFIG?.ml_engine?.default_model_path || "/ml/browser/model.json";
    this.model = null;
    this.isLoading = false;
  }

  /**
   * @param {string} [customPath]
   */
  async load(customPath) {
    if (customPath) {
      this.modelPath = customPath;
    }

    if (!this.modelPath) {
      throw new Error("No model path specified for ModelInference.");
    }

    // Clean up previous model if switching
    if (this.model) {
      this.dispose();
    }

    this.isLoading = true;

    try {
      // Auto-detect format or try loadGraphModel first (matching public/ml/browser/model.json)
      // and fall back to loadLayersModel seamlessly
      try {
        this.model = await tf.loadGraphModel(this.modelPath);
      } catch {
        this.model = await tf.loadLayersModel(this.modelPath);
      }
    } finally {
      this.isLoading = false;
    }
  }

  async switchModel(newModelPath) {
    if (!newModelPath || newModelPath === this.modelPath && this.model) {
      return;
    }
    await this.load(newModelPath);
  }

  predict(features) {
    if (!this.model) {
      throw new Error("ML model is not loaded.");
    }

    if (!Array.isArray(features) || features.length !== 31) {
      throw new Error(
        `Expected 31 features, received ${features?.length ?? 0}.`
      );
    }

    const input = tf.tensor2d([features], [1, 31], "float32");
    const output = this.model.predict(input);
    const values = Array.from(output.dataSync());

    input.dispose();
    output.dispose();

    return {
      flow_strength: values[0],
      turbulence: values[1],
      pigment_spread: values[2],
      displacement: values[3],
      warp: values[4],
      color_shift: values[5],
      detail: values[6],
      activity: values[7],
    };
  }

  dispose() {
    this.model?.dispose();
    this.model = null;
  }
}

