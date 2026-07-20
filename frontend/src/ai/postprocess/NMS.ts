import type { BoxDetection } from './BoxConverter';

/** Translates `box_iou(box, boxes)` from `verify_export.py`. */
export function boxIoU(box: BoxDetection, boxes: BoxDetection[]): number[] {
  return boxes.map((other) => {
    const x1 = Math.max(box.x1, other.x1);
    const y1 = Math.max(box.y1, other.y1);
    const x2 = Math.min(box.x2, other.x2);
    const y2 = Math.min(box.y2, other.y2);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const boxArea = Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
    const boxesArea = Math.max(0, other.x2 - other.x1) * Math.max(0, other.y2 - other.y1);

    return intersection / (boxArea + boxesArea - intersection + 1e-6);
  });
}

/**
 * Translates `class_wise_nms(boxes, scores, class_ids)` from
 * `verify_export.py`. Suppression occurs only among detections with the same
 * classId; returned detections are then ordered by descending confidence.
 */
export function classWiseNMS(
  detections: BoxDetection[],
  iouThreshold: number,
): BoxDetection[] {
  const keep: BoxDetection[] = [];
  const detectionsByClass = new Map<number, BoxDetection[]>();

  for (const detection of detections) {
    const classDetections = detectionsByClass.get(detection.classId);

    if (classDetections === undefined) {
      detectionsByClass.set(detection.classId, [detection]);
    } else {
      classDetections.push(detection);
    }
  }

  for (const classId of [...detectionsByClass.keys()].sort((a, b) => a - b)) {
    const classDetections = detectionsByClass.get(classId);
    if (classDetections === undefined) {
      continue;
    }

    let order = [...classDetections].sort((a, b) => b.confidence - a.confidence);

    while (order.length > 0) {
      const current = order[0];
      keep.push(current);

      if (order.length === 1) {
        break;
      }

      const remaining = order.slice(1);
      const overlaps = boxIoU(current, remaining);
      order = remaining.filter((_, index) => overlaps[index] <= iouThreshold);
    }
  }

  return keep.sort((a, b) => b.confidence - a.confidence);
}
