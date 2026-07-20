import type { Detection } from "../ai/types";
import { GUIDE_FRAMES } from "./guideFrames";
import type { GuideFrameBox, PoseResult, VehiclePose } from "./types";

interface FrameSize {
  width: number;
  height: number;
}

const UNKNOWN_POSE: PoseResult = {
  pose: "unknown",
  confidence: 0,
};

const MIN_POSE_CONFIDENCE = 0.42;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeDetection(det: Detection, frame: FrameSize): GuideFrameBox & { confidence: number } {
  return {
    classId: det.classId,
    label: det.label,
    x: det.x / frame.width,
    y: det.y / frame.height,
    width: det.width / frame.width,
    height: det.height / frame.height,
    confidence: det.confidence,
  };
}

function centerX(box: GuideFrameBox) {
  return box.x + box.width / 2;
}

function centerY(box: GuideFrameBox) {
  return box.y + box.height / 2;
}

function boxDistance(a: GuideFrameBox, b: GuideFrameBox) {
  const centerDistance = Math.abs(centerX(a) - centerX(b)) + Math.abs(centerY(a) - centerY(b));
  const sizeDistance = Math.abs(a.width - b.width) + Math.abs(a.height - b.height);

  return centerDistance * 0.7 + sizeDistance * 0.3;
}

function scoreGuideFrame(
  guideBoxes: GuideFrameBox[],
  detections: Array<GuideFrameBox & { confidence: number }>
) {
  let totalScore = 0;
  let matched = 0;

  for (const guideBox of guideBoxes) {
    const candidates = detections.filter((det) => det.classId === guideBox.classId);

    if (candidates.length === 0) {
      continue;
    }

    const bestCandidate = candidates
      .map((candidate) => ({
        candidate,
        distance: boxDistance(guideBox, candidate),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    const geometryScore = clamp01(1 - bestCandidate.distance / 0.55);
    totalScore += geometryScore * bestCandidate.candidate.confidence;
    matched += 1;
  }

  return matched === guideBoxes.length ? totalScore / guideBoxes.length : 0;
}

export function estimateVehiclePose(
  detections: Detection[],
  frame: FrameSize
): PoseResult {
  if (frame.width <= 0 || frame.height <= 0) {
    return UNKNOWN_POSE;
  }

  if (detections.length === 0) {
    return UNKNOWN_POSE;
  }

  const normalizedDetections = detections.map((det) => normalizeDetection(det, frame));
  const bestResult = Object.values(GUIDE_FRAMES)
    .map((guideFrame) => ({
      pose: guideFrame.pose,
      confidence: scoreGuideFrame(guideFrame.boxes, normalizedDetections),
    }))
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!bestResult || bestResult.confidence < MIN_POSE_CONFIDENCE) {
    return UNKNOWN_POSE;
  }

  return {
    pose: bestResult.pose as VehiclePose,
    confidence: clamp01(bestResult.confidence),
  };
}
