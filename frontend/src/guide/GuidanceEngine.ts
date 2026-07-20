import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import { getTargetLayout, resolveTargetLayout, type AnyTargetLayout, type CaptureAngle } from './TargetLayout';
import type { VehicleId } from './VehicleProfiles';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PairGeometry {
  plateCenter: NormalizedPoint;
  wheelCenter: NormalizedPoint;
  midpoint: NormalizedPoint;
  dx: number;
  dy: number;
  distance: number;
  angleRadians: number;
}

export interface WheelSelectionDebug {
  candidateCount: number;
  selectedConfidence?: number;
  selectedCenter?: NormalizedPoint;
  distanceFromTarget?: number;
  strategy: 'no-candidate' | 'single-candidate' | 'closest-to-target';
}

export interface CurrentPairGeometryResult {
  plateDetection?: BoxDetection;
  wheelDetection?: BoxDetection;
  plateCenter?: NormalizedPoint;
  wheelCenter?: NormalizedPoint;
  pair?: PairGeometry;
  wheelSelection: WheelSelectionDebug;
}

export interface GuidanceErrorComponents {
  midpointDx: number;
  midpointDy: number;
  distanceError: number;
  distanceDelta: number;
  angleError: number;
  plateDx: number;
  plateDy: number;
  wheelDx: number;
  wheelDy: number;
}

export interface GuidanceScoreComponents {
  translation: number;
  scale: number;
  angle: number;
  plate: number;
  wheel: number;
}

export interface GuidanceComponentReady {
  translation: boolean;
  scale: boolean;
  angle: boolean;
  plate: boolean;
  wheel: boolean;
}

export interface GuidanceState {
  frameWidth: number;
  frameHeight: number;
  plateDetected: boolean;
  wheelDetected: boolean;
  plateCurrent?: NormalizedPoint;
  wheelCurrent?: NormalizedPoint;
  plateTarget: NormalizedPoint;
  wheelTarget: NormalizedPoint;
  plateDelta: {
    dx: number;
    dy: number;
  };
  wheelDelta: {
    dx: number;
    dy: number;
  };
  plateError: number;
  wheelError: number;
  targetPair: PairGeometry;
  currentPair?: PairGeometry;
  wheelSelection: WheelSelectionDebug;
  errors: GuidanceErrorComponents;
  scores: GuidanceScoreComponents;
  componentReady: GuidanceComponentReady;
  overallScore: number;
  ready: boolean;
  hints: string[];
}

const LICENSE_PLATE_CLASS_ID = 0;
const WHEEL_CLASS_ID = 1;

function detectionCenter(detection: BoxDetection, imageWidth: number, imageHeight: number): NormalizedPoint {
  return {
    x: (detection.x1 + detection.x2) / 2 / imageWidth,
    y: (detection.y1 + detection.y2) / 2 / imageHeight,
  };
}

function calculatePairGeometry(plateCenter: NormalizedPoint, wheelCenter: NormalizedPoint): PairGeometry {
  const dx = wheelCenter.x - plateCenter.x;
  const dy = wheelCenter.y - plateCenter.y;

  return {
    plateCenter,
    wheelCenter,
    midpoint: {
      x: (plateCenter.x + wheelCenter.x) / 2,
      y: (plateCenter.y + wheelCenter.y) / 2,
    },
    dx,
    dy,
    distance: Math.hypot(dx, dy),
    angleRadians: Math.atan2(dy, dx),
  };
}

function selectHighestConfidenceDetection(
  detections: readonly BoxDetection[],
  classId: number,
): BoxDetection | undefined {
  let selected: BoxDetection | undefined;

  for (const detection of detections) {
    if (detection.classId === classId && (selected === undefined || detection.confidence > selected.confidence)) {
      selected = detection;
    }
  }

  return selected;
}

function normalizeAngleDifference(angleA: number, angleB: number): number {
  let difference = angleA - angleB;

  while (difference > Math.PI) {
    difference -= Math.PI * 2;
  }

  while (difference < -Math.PI) {
    difference += Math.PI * 2;
  }

  return difference;
}

function scoreFromAxisError(error: number, tolerance: number): number {
  const magnitude = Math.abs(error);

  if (tolerance <= 0) {
    return magnitude === 0 ? 100 : 0;
  }

  if (magnitude <= tolerance) {
    return Math.round(90 + (1 - magnitude / tolerance) * 10);
  }

  return Math.round(Math.max(0, 90 * (1 - (magnitude - tolerance) / tolerance)));
}

function scoreFromTwoAxisError(dx: number, toleranceX: number, dy: number, toleranceY: number): number {
  return Math.min(scoreFromAxisError(dx, toleranceX), scoreFromAxisError(dy, toleranceY));
}

function emptyErrors(): GuidanceErrorComponents {
  return {
    midpointDx: 0,
    midpointDy: 0,
    distanceError: 1,
    distanceDelta: 1,
    angleError: Math.PI,
    plateDx: 0,
    plateDy: 0,
    wheelDx: 0,
    wheelDy: 0,
  };
}

/**
 * Selects the wheel whose normalized center is closest to the target wheel
 * position. Confidence is considered only when two distances are exactly equal.
 */
export function selectTargetWheel(
  wheels: BoxDetection[],
  imageWidth: number,
  imageHeight: number,
  target: NormalizedPoint,
): BoxDetection | undefined {
  let selectedWheel: BoxDetection | undefined;
  let selectedDistance = Number.POSITIVE_INFINITY;

  for (const wheel of wheels) {
    const center = detectionCenter(wheel, imageWidth, imageHeight);
    const distance = Math.hypot(center.x - target.x, center.y - target.y);

    if (
      distance < selectedDistance
      || (distance === selectedDistance && (selectedWheel === undefined || wheel.confidence > selectedWheel.confidence))
    ) {
      selectedWheel = wheel;
      selectedDistance = distance;
    }
  }

  return selectedWheel;
}

export function calculateCurrentPairGeometry(
  detections: readonly BoxDetection[],
  imageWidth: number,
  imageHeight: number,
  targetWheel: NormalizedPoint,
): CurrentPairGeometryResult {
  const plateDetection = selectHighestConfidenceDetection(detections, LICENSE_PLATE_CLASS_ID);
  const wheelCandidates = detections.filter((detection) => detection.classId === WHEEL_CLASS_ID);
  const wheelDetection = selectTargetWheel(wheelCandidates, imageWidth, imageHeight, targetWheel);
  const plateCenter = plateDetection === undefined ? undefined : detectionCenter(plateDetection, imageWidth, imageHeight);
  const wheelCenter = wheelDetection === undefined ? undefined : detectionCenter(wheelDetection, imageWidth, imageHeight);
  const wheelSelection: WheelSelectionDebug = {
    candidateCount: wheelCandidates.length,
    selectedConfidence: wheelDetection?.confidence,
    selectedCenter: wheelCenter,
    distanceFromTarget: wheelCenter === undefined ? undefined : Math.hypot(wheelCenter.x - targetWheel.x, wheelCenter.y - targetWheel.y),
    strategy: wheelCandidates.length === 0
      ? 'no-candidate'
      : wheelCandidates.length === 1 ? 'single-candidate' : 'closest-to-target',
  };

  return {
    plateDetection,
    wheelDetection,
    plateCenter,
    wheelCenter,
    pair: plateCenter === undefined || wheelCenter === undefined
      ? undefined
      : calculatePairGeometry(plateCenter, wheelCenter),
    wheelSelection,
  };
}

/**
 * Calculates the current guidance state from recovered detection coordinates.
 * The plate and wheel are evaluated as one paired composition.
 */
export function calculateGuidanceState(
  detections: BoxDetection[],
  imageWidth: number,
  imageHeight: number,
  vehicleId: VehicleId,
  angle: CaptureAngle,
  overrideLayout?: AnyTargetLayout,
): GuidanceState {
  const layout = overrideLayout === undefined
    ? getTargetLayout(vehicleId, angle)
    : resolveTargetLayout(overrideLayout);
  const plateTarget = { x: layout.plate.x, y: layout.plate.y };
  const wheelTarget = { x: layout.wheel.x, y: layout.wheel.y };
  const targetPair = calculatePairGeometry(plateTarget, wheelTarget);
  const current = calculateCurrentPairGeometry(detections, imageWidth, imageHeight, wheelTarget);
  const plateCurrent = current.plateCenter;
  const wheelCurrent = current.wheelCenter;
  const currentPair = current.pair;
  const plateDelta = plateCurrent === undefined
    ? { dx: 0, dy: 0 }
    : {
        dx: plateCurrent.x - layout.plate.x,
        dy: plateCurrent.y - layout.plate.y,
      };
  const wheelDelta = wheelCurrent === undefined
    ? { dx: 0, dy: 0 }
    : {
        dx: wheelCurrent.x - layout.wheel.x,
        dy: wheelCurrent.y - layout.wheel.y,
      };
  const errors = currentPair === undefined
    ? emptyErrors()
    : {
        midpointDx: currentPair.midpoint.x - targetPair.midpoint.x,
        midpointDy: currentPair.midpoint.y - targetPair.midpoint.y,
        distanceDelta: currentPair.distance - layout.relation.distance,
        distanceError: Math.abs(currentPair.distance - layout.relation.distance),
        angleError: Math.abs(normalizeAngleDifference(currentPair.angleRadians, layout.relation.angleRadians)),
        plateDx: plateDelta.dx,
        plateDy: plateDelta.dy,
        wheelDx: wheelDelta.dx,
        wheelDy: wheelDelta.dy,
      };
  const plateError = plateCurrent === undefined ? 1 : Math.max(Math.abs(errors.plateDx), Math.abs(errors.plateDy));
  const wheelError = wheelCurrent === undefined ? 1 : Math.max(Math.abs(errors.wheelDx), Math.abs(errors.wheelDy));
  const scores = {
    translation: scoreFromTwoAxisError(errors.midpointDx, layout.tolerances.translationX, errors.midpointDy, layout.tolerances.translationY),
    scale: scoreFromAxisError(errors.distanceError, layout.tolerances.scale),
    angle: scoreFromAxisError(errors.angleError, layout.tolerances.angleRadians),
    plate: scoreFromTwoAxisError(errors.plateDx, layout.tolerances.plateFineX, errors.plateDy, layout.tolerances.plateFineY),
    wheel: scoreFromTwoAxisError(errors.wheelDx, layout.tolerances.wheelFineX, errors.wheelDy, layout.tolerances.wheelFineY),
  };
  const componentReady = {
    translation: currentPair !== undefined
      && Math.abs(errors.midpointDx) <= layout.tolerances.translationX
      && Math.abs(errors.midpointDy) <= layout.tolerances.translationY,
    scale: currentPair !== undefined && errors.distanceError <= layout.tolerances.scale,
    angle: currentPair !== undefined && errors.angleError <= layout.tolerances.angleRadians,
    plate: plateCurrent !== undefined
      && Math.abs(errors.plateDx) <= layout.tolerances.plateFineX
      && Math.abs(errors.plateDy) <= layout.tolerances.plateFineY,
    wheel: wheelCurrent !== undefined
      && Math.abs(errors.wheelDx) <= layout.tolerances.wheelFineX
      && Math.abs(errors.wheelDy) <= layout.tolerances.wheelFineY,
  };
  const overallScore = Math.round((
    scores.translation
    + scores.scale
    + scores.angle
    + scores.plate
    + scores.wheel
  ) / 5);
  const ready = Object.values(componentReady).every(Boolean) && overallScore >= 90;
  const hints: string[] = [];

  if (plateCurrent === undefined) {
    hints.push('尚未偵測到車牌');
  }

  if (wheelCurrent === undefined) {
    hints.push('尚未偵測到輪胎');
  }

  if (currentPair !== undefined) {
    if (!componentReady.translation) {
      if (Math.abs(errors.midpointDx) >= Math.abs(errors.midpointDy)) {
        hints.push(errors.midpointDx < 0 ? '請將手機向右移動' : '請將手機向左移動');
      } else {
        hints.push(errors.midpointDy < 0 ? '請將手機向下移動' : '請將手機向上移動');
      }
    } else if (!componentReady.scale) {
      hints.push(errors.distanceDelta < 0 ? '請靠近車輛' : '請遠離車輛');
    } else if (!componentReady.angle) {
      hints.push('請調整拍攝角度');
    } else if (!componentReady.plate || !componentReady.wheel) {
      const dominantDelta = Math.abs(errors.plateDx) + Math.abs(errors.plateDy) >= Math.abs(errors.wheelDx) + Math.abs(errors.wheelDy)
        ? { dx: errors.plateDx, dy: errors.plateDy }
        : { dx: errors.wheelDx, dy: errors.wheelDy };

      if (Math.abs(dominantDelta.dx) >= Math.abs(dominantDelta.dy)) {
        hints.push(dominantDelta.dx < 0 ? '請將手機向右微調' : '請將手機向左微調');
      } else {
        hints.push(dominantDelta.dy < 0 ? '請將手機向下微調' : '請將手機向上微調');
      }
    } else if (!ready) {
      hints.push('請保持手機穩定');
    }
  }

  return {
    frameWidth: imageWidth,
    frameHeight: imageHeight,
    plateDetected: plateCurrent !== undefined,
    wheelDetected: wheelCurrent !== undefined,
    plateCurrent,
    wheelCurrent,
    plateTarget,
    wheelTarget,
    plateDelta,
    wheelDelta,
    plateError,
    wheelError,
    targetPair,
    currentPair,
    wheelSelection: current.wheelSelection,
    errors,
    scores,
    componentReady,
    overallScore,
    ready,
    hints,
  };
}
