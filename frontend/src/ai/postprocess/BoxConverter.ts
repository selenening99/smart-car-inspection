import type { RawDetection } from './Decoder';

/** A raw detection box converted from center/size coordinates to corner coordinates. */
export interface BoxDetection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  classId: number;
  confidence: number;
}

/**
 * Translates `xywh_to_xyxy()` from `verify_export.py` for each raw detection.
 * No clipping, scaling, padding removal, class filtering, or NMS is performed.
 */
export function convertXYWHToXYXY(detections: RawDetection[]): BoxDetection[] {
  return detections.map((detection) => ({
    x1: detection.cx - detection.width / 2,
    y1: detection.cy - detection.height / 2,
    x2: detection.cx + detection.width / 2,
    y2: detection.cy + detection.height / 2,
    classId: detection.classId,
    confidence: detection.confidence,
  }));
}
