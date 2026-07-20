import { getVehicleProfile, type VehicleId } from './VehicleProfiles';

export type CaptureAngle =
  | 'front-left'
  | 'front-right'
  | 'rear-left'
  | 'rear-right';

export interface TargetRegion {
  /** Normalized expected center. */
  x: number;
  y: number;
  /** Normalized expected object dimensions. */
  width: number;
  height: number;
  /** Fine-alignment tolerances for the center. */
  toleranceX: number;
  toleranceY: number;
  /** @deprecated Legacy debug pages may still read this; new layouts use toleranceX/toleranceY. */
  tolerance?: number;
}

export interface LegacyTargetPoint {
  x: number;
  y: number;
  tolerance: number;
}

/** @deprecated Use TargetRegion for all new layouts. */
export type TargetPoint = LegacyTargetPoint;

export interface TargetRelation {
  dx: number;
  dy: number;
  distance: number;
  angleRadians: number;
}

export interface ExpectedVehicleSize {
  width: number;
  height: number;
}

export interface TargetTolerances {
  translationX: number;
  translationY: number;
  scale: number;
  angleRadians: number;
  plateFineX: number;
  plateFineY: number;
  wheelFineX: number;
  wheelFineY: number;
}

export interface TargetLayoutMetadata {
  vehicleId?: string;
  captureAngle?: CaptureAngle;
  generatedAt?: string;
  calibrationSampleCount?: number;
  calibrationSource?: 'manual-baseline' | 'dataset-calibration';
  schemaVersion?: number;
}

export interface TargetGuideRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetLayout {
  plate: TargetRegion;
  wheel: TargetRegion;
  relation?: TargetRelation;
  expectedVehicleSize?: ExpectedVehicleSize;
  tolerances?: TargetTolerances;
  metadata?: TargetLayoutMetadata;
}

export interface LegacyTargetLayout {
  plate: LegacyTargetPoint;
  wheel: LegacyTargetPoint;
  relation?: TargetRelation;
  expectedVehicleSize?: ExpectedVehicleSize;
  tolerances?: Partial<TargetTolerances>;
  metadata?: TargetLayoutMetadata;
}

export type AnyTargetLayout = TargetLayout | LegacyTargetLayout;

export interface ResolvedTargetLayout {
  plate: TargetRegion;
  wheel: TargetRegion;
  relation: TargetRelation;
  expectedVehicleSize: ExpectedVehicleSize;
  tolerances: TargetTolerances;
  metadata?: TargetLayoutMetadata;
  isLegacy: boolean;
}

export function angleLabel(angle: CaptureAngle): string {
  if (angle === 'front-left') {
    return '左前方';
  }

  if (angle === 'front-right') {
    return '右前方';
  }

  if (angle === 'rear-left') {
    return '左後方';
  }

  return '右後方';
}

export function isLegacyTargetPoint(target: TargetRegion | LegacyTargetPoint): target is LegacyTargetPoint {
  return 'tolerance' in target;
}

export function deriveTargetRelation(plate: Pick<TargetRegion, 'x' | 'y'>, wheel: Pick<TargetRegion, 'x' | 'y'>): TargetRelation {
  const dx = wheel.x - plate.x;
  const dy = wheel.y - plate.y;

  return {
    dx,
    dy,
    distance: Math.hypot(dx, dy),
    angleRadians: Math.atan2(dy, dx),
  };
}

export function targetRegionToGuideRectangle(
  target: TargetRegion,
  frame: { width: number; height: number },
): TargetGuideRectangle {
  const width = target.width * frame.width;
  const height = target.height * frame.height;
  const centerX = target.x * frame.width;
  const centerY = target.y * frame.height;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function resolveLegacyTargetPoint(target: TargetRegion | LegacyTargetPoint, objectType: 'plate' | 'wheel'): TargetRegion {
  if (!isLegacyTargetPoint(target)) {
    return {
      ...target,
      tolerance: target.tolerance ?? Math.max(target.toleranceX, target.toleranceY),
    };
  }

  const width = objectType === 'plate' ? target.tolerance * 1.8 : target.tolerance * 2;
  const height = objectType === 'plate' ? target.tolerance * 0.7 : target.tolerance * 2;

  return {
    x: target.x,
    y: target.y,
    width,
    height,
    toleranceX: target.tolerance,
    toleranceY: target.tolerance,
    tolerance: target.tolerance,
  };
}

function deriveExpectedVehicleSize(plate: TargetRegion, wheel: TargetRegion): ExpectedVehicleSize {
  const left = Math.min(plate.x - plate.width / 2, wheel.x - wheel.width / 2);
  const right = Math.max(plate.x + plate.width / 2, wheel.x + wheel.width / 2);
  const top = Math.min(plate.y - plate.height / 2, wheel.y - wheel.height / 2);
  const bottom = Math.max(plate.y + plate.height / 2, wheel.y + wheel.height / 2);

  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function deriveTargetTolerances(
  layout: AnyTargetLayout,
  plate: TargetRegion,
  wheel: TargetRegion,
): TargetTolerances {
  return {
    translationX: layout.tolerances?.translationX ?? Math.min(plate.toleranceX, wheel.toleranceX) * 0.8,
    translationY: layout.tolerances?.translationY ?? Math.min(plate.toleranceY, wheel.toleranceY) * 0.8,
    scale: layout.tolerances?.scale ?? Math.max(plate.toleranceX, wheel.toleranceX),
    angleRadians: layout.tolerances?.angleRadians ?? 0.18,
    plateFineX: layout.tolerances?.plateFineX ?? plate.toleranceX,
    plateFineY: layout.tolerances?.plateFineY ?? plate.toleranceY,
    wheelFineX: layout.tolerances?.wheelFineX ?? wheel.toleranceX,
    wheelFineY: layout.tolerances?.wheelFineY ?? wheel.toleranceY,
  };
}

export function resolveTargetLayout(layout: AnyTargetLayout): ResolvedTargetLayout {
  const isLegacy = isLegacyTargetPoint(layout.plate) || isLegacyTargetPoint(layout.wheel);
  const plate = resolveLegacyTargetPoint(layout.plate, 'plate');
  const wheel = resolveLegacyTargetPoint(layout.wheel, 'wheel');

  return {
    plate,
    wheel,
    relation: deriveTargetRelation(plate, wheel),
    expectedVehicleSize: layout.expectedVehicleSize ?? deriveExpectedVehicleSize(plate, wheel),
    tolerances: deriveTargetTolerances(layout, plate, wheel),
    metadata: layout.metadata,
    isLegacy,
  };
}

/** Returns the resolved layout for one vehicle profile and capture angle. */
export function getTargetLayout(
  vehicleId: VehicleId,
  angle: CaptureAngle,
): ResolvedTargetLayout {
  return resolveTargetLayout(getVehicleProfile(vehicleId).captureLayouts[angle]);
}
