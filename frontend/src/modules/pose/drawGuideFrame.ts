import { GUIDE_FRAMES } from "./guideFrames";
import type { PoseResult } from "./types";

const GUIDE_COLORS: Record<number, string> = {
  0: "rgba(255, 214, 10, 0.95)",
  1: "rgba(0, 229, 255, 0.95)",
};

export function drawGuideFrame(canvas: HTMLCanvasElement, pose: PoseResult) {
  if (pose.pose === "unknown") {
    return;
  }

  const guideFrame = GUIDE_FRAMES[pose.pose];
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  ctx.save();
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);

  guideFrame.boxes.forEach((box) => {
    ctx.strokeStyle = GUIDE_COLORS[box.classId] ?? "rgba(255, 255, 255, 0.95)";
    ctx.strokeRect(
      box.x * canvas.width,
      box.y * canvas.height,
      box.width * canvas.width,
      box.height * canvas.height
    );
  });

  ctx.restore();
}
