import { Detection } from "./types";

function iou(a: Detection, b: Detection) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);

  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersection =
    Math.max(0, x2 - x1) *
    Math.max(0, y2 - y1);

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;

  return (
    intersection /
    (areaA + areaB - intersection + 1e-6)
  );
}

export function nonMaximumSuppression(
  detections: Detection[],
  threshold = 0.5
) {
  const sorted = [...detections].sort(
    (a, b) => b.confidence - a.confidence
  );

  const keep: Detection[] = [];

  while (sorted.length > 0) {
    const current = sorted.shift()!;

    keep.push(current);

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(current, sorted[i]) > threshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return keep;
}