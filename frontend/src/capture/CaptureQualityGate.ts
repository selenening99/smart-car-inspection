import type { GuidanceState } from '../guide/GuidanceEngine';

export interface FrameValidatorResult {
  isBlurred: boolean;
  isMoving: boolean;
  isOverExposed: boolean;
  isUnderExposed: boolean;
  brightnessScore: number;
  blurScore: number;
  motionScore: number;
}

export type CaptureRejectionReason =
  | 'Vehicle Not Ready'
  | 'Motion Blur'
  | 'Low Brightness'
  | 'Over Exposure'
  | 'Camera Moving'
  | 'Detection Lost';

export interface CaptureDecision {
  allowCapture: boolean;
  reason: CaptureRejectionReason | undefined;
  qualityScore: number;
}

export const DEFAULT_CAPTURE_SCORE_THRESHOLD = 90;

/**
 * Evaluates whether one already-observed frame may be captured. Quality scores
 * may be supplied as either 0–1 or 0–100 values; they are normalized to 0–100
 * for the returned score. The boolean validator results determine quality pass/fail.
 */
export function evaluateCaptureDecision(
  guidance: GuidanceState,
  frame: FrameValidatorResult,
  scoreThreshold: number = DEFAULT_CAPTURE_SCORE_THRESHOLD,
): CaptureDecision {
  const normalizeScore = (score: number): number => {
    const percentage = score <= 1 ? score * 100 : score;
    return Math.min(100, Math.max(0, percentage));
  };
  const qualityScore = Math.round(
    (normalizeScore(frame.brightnessScore) + normalizeScore(frame.blurScore) + normalizeScore(frame.motionScore)) / 3,
  );

  if (!guidance.plateDetected || !guidance.wheelDetected) {
    return { allowCapture: false, reason: 'Detection Lost', qualityScore };
  }

  if (!guidance.ready || guidance.overallScore < scoreThreshold) {
    return { allowCapture: false, reason: 'Vehicle Not Ready', qualityScore };
  }

  if (frame.isBlurred) {
    return { allowCapture: false, reason: 'Motion Blur', qualityScore };
  }

  if (frame.isUnderExposed) {
    return { allowCapture: false, reason: 'Low Brightness', qualityScore };
  }

  if (frame.isOverExposed) {
    return { allowCapture: false, reason: 'Over Exposure', qualityScore };
  }

  if (frame.isMoving) {
    return { allowCapture: false, reason: 'Camera Moving', qualityScore };
  }

  return { allowCapture: true, reason: undefined, qualityScore };
}
