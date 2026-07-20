import type { BoxDetection } from './BoxConverter';

/** Dimensions of the original image before letterboxing. */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Translates the coordinate-recovery portion of `run_onnx()` in
 * `verify_export.py`. It reverses letterbox padding/scale and clips each
 * coordinate to the original image bounds without changing classId/confidence.
 */
export function recoverOriginalCoordinates(
  detections: BoxDetection[],
  scale: number,
  padX: number,
  padY: number,
  imageSize: ImageSize,
): BoxDetection[] {
  return detections.map((detection) => ({
    x1: Math.min(Math.max((detection.x1 - padX) / scale, 0), imageSize.width),
    y1: Math.min(Math.max((detection.y1 - padY) / scale, 0), imageSize.height),
    x2: Math.min(Math.max((detection.x2 - padX) / scale, 0), imageSize.width),
    y2: Math.min(Math.max((detection.y2 - padY) / scale, 0), imageSize.height),
    classId: detection.classId,
    confidence: detection.confidence,
  }));
}
