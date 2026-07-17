import type { Detection } from "../ai/types";
import type { PoseResult, VehiclePose } from "./types";

interface FrameSize {
  width: number;
  height: number;
}

interface BoxCenter {
  x: number;
  y: number;
}

const UNKNOWN_POSE: PoseResult = {
  pose: "unknown",
  confidence: 0,
};

const MIN_POSE_CONFIDENCE = 0.28;
const MIN_HORIZONTAL_SEPARATION = 0.08;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function boxCenter(det: Detection): BoxCenter {
  return {
    x: det.x + det.width / 2,
    y: det.y + det.height / 2,
  };
}

function isLicensePlate(det: Detection) {
  return det.classId === 0 || det.label.toLowerCase().includes("license");
}

function isWheel(det: Detection) {
  return det.classId === 1 || det.label.toLowerCase().includes("wheel");
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function chooseBestLicensePlate(detections: Detection[]) {
  return detections
    .filter(isLicensePlate)
    .sort((a, b) => b.confidence - a.confidence)[0];
}

function choosePose(frontOrRear: "front" | "rear", side: "left" | "right"): VehiclePose {
  if (frontOrRear === "front" && side === "left") return "front_left";
  if (frontOrRear === "front" && side === "right") return "front_right";
  if (frontOrRear === "rear" && side === "left") return "rear_left";
  return "rear_right";
}

export function estimateVehiclePose(
  detections: Detection[],
  frame: FrameSize
): PoseResult {
  if (frame.width <= 0 || frame.height <= 0) {
    return UNKNOWN_POSE;
  }

  const plate = chooseBestLicensePlate(detections);
  const wheels = detections.filter(isWheel);

  if (!plate || wheels.length === 0) {
    return UNKNOWN_POSE;
  }

  const plateCenter = boxCenter(plate);
  const wheelCenters = wheels.map(boxCenter);
  const wheelCenterX = mean(wheelCenters.map((center) => center.x));
  const normalizedSeparation = Math.abs(wheelCenterX - plateCenter.x) / frame.width;

  if (normalizedSeparation < MIN_HORIZONTAL_SEPARATION) {
    return UNKNOWN_POSE;
  }

  /*
   * Sprint 2 intentionally reuses the existing detector output. With only
   * license-plate and wheel boxes, front-vs-rear is a workflow heuristic:
   * the plate end is treated as front when it lands left of center, rear when
   * it lands right of center. Wheel offset estimates which vehicle side is
   * visible. Weak geometry falls back to unknown.
   */
  const frontOrRear = plateCenter.x < frame.width / 2 ? "front" : "rear";
  const side = wheelCenterX > plateCenter.x ? "left" : "right";
  const separationScore = clamp01((normalizedSeparation - MIN_HORIZONTAL_SEPARATION) / 0.24);
  const centerOffsetScore = clamp01(Math.abs(plateCenter.x / frame.width - 0.5) / 0.32);
  const wheelConfidence = mean(wheels.map((wheel) => wheel.confidence));
  const confidence = clamp01(
    plate.confidence * 0.45 +
      wheelConfidence * 0.25 +
      separationScore * 0.2 +
      centerOffsetScore * 0.1
  );

  if (confidence < MIN_POSE_CONFIDENCE) {
    return UNKNOWN_POSE;
  }

  return {
    pose: choosePose(frontOrRear, side),
    confidence,
  };
}
