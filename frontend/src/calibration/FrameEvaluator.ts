import type { FrameValidatorResult } from '../capture/CaptureQualityGate';
import { validateFrameQuality } from '../capture/FrameQualityValidator';

export interface FrameEvaluation {
  frameQuality: FrameValidatorResult;
  qualityScore: number;
  qualityTime: number;
}

const QUALITY_CANVAS_WIDTH = 320;
const QUALITY_CANVAS_HEIGHT = 180;

/**
 * Evaluates image quality using one reusable downscaled canvas. The evaluator
 * deliberately does not accept/reject a frame; threshold policy belongs to
 * the dataset processor.
 */
export class FrameEvaluator {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;

  public constructor() {
    this.canvas.width = QUALITY_CANVAS_WIDTH;
    this.canvas.height = QUALITY_CANVAS_HEIGHT;
    const context = this.canvas.getContext('2d');

    if (context === null) {
      throw new Error('Quality analysis canvas is unavailable.');
    }

    this.context = context;
  }

  /** Measures quality for a decoded image and records only this stage's time. */
  public evaluate(image: CanvasImageSource): FrameEvaluation {
    const startedAt = performance.now();
    this.context.drawImage(image, 0, 0, QUALITY_CANVAS_WIDTH, QUALITY_CANVAS_HEIGHT);
    const frameQuality = validateFrameQuality(
      this.context.getImageData(0, 0, QUALITY_CANVAS_WIDTH, QUALITY_CANVAS_HEIGHT),
      undefined,
    );

    return {
      frameQuality,
      qualityScore: (frameQuality.brightnessScore + frameQuality.blurScore + frameQuality.motionScore) / 3,
      qualityTime: performance.now() - startedAt,
    };
  }
}
