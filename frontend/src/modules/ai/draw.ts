import { Detection } from "./types";

export function drawDetections(
  canvas: HTMLCanvasElement,
  detections: Detection[]
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  ctx.lineWidth = 3;
  ctx.font = "20px Arial";

  detections.forEach((det) => {
    ctx.strokeStyle = "#00ff00";
    ctx.fillStyle = "#00ff00";

    ctx.strokeRect(
      det.x,
      det.y,
      det.width,
      det.height
    );

    ctx.fillText(
      `${det.label} ${(det.confidence * 100).toFixed(1)}%`,
      det.x,
      det.y - 8
    );
  });
}