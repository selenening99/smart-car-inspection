import { useMemo } from "react";
import type { PoseResult } from "../modules/pose";

interface DebugHUDProps {
  fps: number;
  inferenceTimeMs: number;
  detectionCount: number;
  pose: PoseResult;
}

function formatPose(pose: PoseResult) {
  if (pose.pose === "unknown") {
    return "unknown";
  }

  return `${pose.pose} ${(pose.confidence * 100).toFixed(0)}%`;
}

export function DebugHUD({ fps, inferenceTimeMs, detectionCount, pose }: DebugHUDProps) {
  const text = useMemo(
    () => [
      `FPS: ${fps.toFixed(1)}`,
      `Inference: ${inferenceTimeMs.toFixed(1)} ms`,
      `Detections: ${detectionCount}`,
      `Pose: ${formatPose(pose)}`,
    ].join(" | "),
    [fps, inferenceTimeMs, detectionCount, pose]
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        padding: "8px 12px",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        color: "#fff",
        borderRadius: 8,
        fontSize: 14,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
