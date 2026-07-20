import * as ort from 'onnxruntime-web';

/**
 * Lazily creates one ONNX Runtime session and returns the same promise to all
 * subsequent callers. A failed creation is not cached, so a later run may
 * retry normally.
 */
export class DetectorSessionProvider {
  private sessionPromise: Promise<ort.InferenceSession> | undefined;

  public async getSession(): Promise<ort.InferenceSession> {
    if (this.sessionPromise === undefined) {
      const modelPath = `${import.meta.env.BASE_URL}best.onnx`;
      this.sessionPromise = ort.InferenceSession.create(modelPath, {
        executionProviders: ['wasm'],
      }).catch((error: unknown) => {
        this.sessionPromise = undefined;
        throw error;
      });
    }

    return this.sessionPromise;
  }
}

/** Shared browser-session cache used by all dataset processing runs. */
export const datasetDetectorSessionProvider = new DetectorSessionProvider();
