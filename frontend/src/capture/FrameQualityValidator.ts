import type { FrameValidatorResult } from './CaptureQualityGate';

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function luminance(data: Uint8ClampedArray, offset: number): number {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

/**
 * Computes lightweight frame-quality signals from image pixels. It is pure and
 * accepts an optional previous frame solely for motion comparison.
 */
export function validateFrameQuality(
  frame: ImageData,
  previousFrame: ImageData | undefined,
): FrameValidatorResult {
  const { data, width, height } = frame;
  let brightnessTotal = 0;
  let edgeTotal = 0;
  let motionTotal = 0;
  let sampleCount = 0;
  const previousMatches = previousFrame?.width === width && previousFrame.height === height;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const offset = (y * width + x) * 4;
      const current = luminance(data, offset);
      const horizontal = luminance(data, (y * width + x + 1) * 4);
      const vertical = luminance(data, ((y + 1) * width + x) * 4);

      brightnessTotal += current;
      edgeTotal += Math.abs(current - horizontal) + Math.abs(current - vertical);

      if (previousMatches && previousFrame !== undefined) {
        motionTotal += Math.abs(current - luminance(previousFrame.data, offset));
      }

      sampleCount += 1;
    }
  }

  const brightness = brightnessTotal / sampleCount;
  const edgeStrength = edgeTotal / sampleCount;
  const motionDifference = previousMatches ? motionTotal / sampleCount : 0;
  const brightnessScore = clampScore(100 - Math.abs(brightness - 128) / 128 * 100);
  const blurScore = clampScore(edgeStrength / 40 * 100);
  const motionScore = clampScore(100 - motionDifference / 30 * 100);

  return {
    isBlurred: edgeStrength < 12,
    isMoving: motionDifference > 12,
    isOverExposed: brightness > 210,
    isUnderExposed: brightness < 45,
    brightnessScore,
    blurScore,
    motionScore,
  };
}
