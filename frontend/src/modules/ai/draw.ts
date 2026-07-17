import { CLASS_NAMES } from "./types";
import type { Detection } from "./types";

const CLASS_COLORS: Record<number, string> = {
  0: "#00ff00",
  1: "#0000ff",
};

export function drawDetections(
  canvas: HTMLCanvasElement,
  detections: Detection[]
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  ctx.lineWidth = 3;
  ctx.font = "20px Arial";

  detections.forEach((det) => {
    const color = CLASS_COLORS[det.classId] ?? "#ff0000";
    const label = CLASS_NAMES[det.classId] ?? det.label;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.strokeRect(det.x, det.y, det.width, det.height);

    ctx.fillText(
      `${label} ${(det.confidence * 100).toFixed(1)}%`,
      det.x,
      det.y - 8
    );
  });
}
