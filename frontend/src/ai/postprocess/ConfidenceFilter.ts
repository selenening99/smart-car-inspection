import type { RawDetection } from './Decoder';

/**
 * Keeps only raw detections whose selected class confidence meets the supplied
 * threshold. It does not alter boxes, classes, coordinates, or detection order.
 */
export function filterByConfidence(
  detections: RawDetection[],
  threshold: number,
): RawDetection[] {
  return detections.filter((detection) => detection.confidence >= threshold);
}
