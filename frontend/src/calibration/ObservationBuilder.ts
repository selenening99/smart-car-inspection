import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import type { CalibrationObservation } from './DatasetLayoutAnalyzer';

export interface ObservationMetrics {
  qualityTime: number;
  inferenceTime: number;
  postprocessTime: number;
  totalTime: number;
}

export interface CalibrationObservationInput {
  imageName: string;
  imageWidth: number;
  imageHeight: number;
  detections: BoxDetection[];
  qualityScore: number;
  metrics: ObservationMetrics;
}

/**
 * Selects a class's most confident detection without allocating or sorting.
 * Equal confidences retain the first detection, matching stable descending
 * sorting used by the previous implementation.
 */
export function selectHighestConfidenceDetection(
  detections: readonly BoxDetection[],
  classId: number,
): BoxDetection | undefined {
  let selected: BoxDetection | undefined;

  for (const detection of detections) {
    if (detection.classId === classId && (selected === undefined || detection.confidence > selected.confidence)) {
      selected = detection;
    }
  }

  return selected;
}

/** Creates one normalized calibration observation from recovered detections. */
export function buildCalibrationObservation(
  input: CalibrationObservationInput,
): CalibrationObservation | undefined {
  const plate = selectHighestConfidenceDetection(input.detections, 0);
  const wheel = selectHighestConfidenceDetection(input.detections, 1);

  if (plate === undefined || wheel === undefined || input.detections.length === 0) {
    return undefined;
  }

  let left = input.detections[0].x1;
  let top = input.detections[0].y1;
  let right = input.detections[0].x2;
  let bottom = input.detections[0].y2;

  for (const detection of input.detections.slice(1)) {
    left = Math.min(left, detection.x1);
    top = Math.min(top, detection.y1);
    right = Math.max(right, detection.x2);
    bottom = Math.max(bottom, detection.y2);
  }

  return {
    imageName: input.imageName,
    plate: {
      x: (plate.x1 + plate.x2) / 2 / input.imageWidth,
      y: (plate.y1 + plate.y2) / 2 / input.imageHeight,
    },
    wheel: {
      x: (wheel.x1 + wheel.x2) / 2 / input.imageWidth,
      y: (wheel.y1 + wheel.y2) / 2 / input.imageHeight,
    },
    vehicleSize: {
      width: (right - left) / input.imageWidth,
      height: (bottom - top) / input.imageHeight,
    },
    plateConfidence: plate.confidence,
    wheelConfidence: wheel.confidence,
    qualityScore: input.qualityScore,
    ...input.metrics,
  };
}
