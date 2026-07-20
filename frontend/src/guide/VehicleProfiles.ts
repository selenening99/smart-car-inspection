import type { CaptureAngle, TargetLayout, TargetRegion } from './TargetLayout';
import { deriveTargetRelation } from './TargetLayout';

export type VehicleId = 'yaris' | 'corolla-cross' | 'altis' | 'camry' | 'yaris-cross';

export interface VehicleProfile {
  vehicleId: VehicleId;
  displayName: string;
  aspectRatio: number;
  inspectionSequence: CaptureAngle[];
  captureLayouts: Record<CaptureAngle, TargetLayout>;
}

function createRegion(
  x: number,
  y: number,
  width: number,
  height: number,
  toleranceX: number,
  toleranceY: number,
): TargetRegion {
  return { x, y, width, height, toleranceX, toleranceY, tolerance: Math.max(toleranceX, toleranceY) };
}

function createTargetLayout(
  vehicleId: VehicleId,
  captureAngle: CaptureAngle,
  plate: TargetRegion,
  wheel: TargetRegion,
): TargetLayout {
  const relation = deriveTargetRelation(plate, wheel);
  const left = Math.min(plate.x - plate.width / 2, wheel.x - wheel.width / 2);
  const right = Math.max(plate.x + plate.width / 2, wheel.x + wheel.width / 2);
  const top = Math.min(plate.y - plate.height / 2, wheel.y - wheel.height / 2);
  const bottom = Math.max(plate.y + plate.height / 2, wheel.y + wheel.height / 2);

  return {
    plate,
    wheel,
    relation,
    expectedVehicleSize: {
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
    tolerances: {
      translationX: Math.min(plate.toleranceX, wheel.toleranceX) * 0.8,
      translationY: Math.min(plate.toleranceY, wheel.toleranceY) * 0.8,
      scale: Math.max(plate.toleranceX, wheel.toleranceX),
      angleRadians: 0.18,
      plateFineX: plate.toleranceX,
      plateFineY: plate.toleranceY,
      wheelFineX: wheel.toleranceX,
      wheelFineY: wheel.toleranceY,
    },
    metadata: {
      vehicleId,
      captureAngle,
      schemaVersion: 2,
    },
  };
}

function standardLayouts(
  vehicleId: VehicleId,
  rearRightPlate: TargetRegion,
  rearRightWheel: TargetRegion,
): Record<CaptureAngle, TargetLayout> {
  const rearLeftPlate = { ...rearRightPlate, x: 1 - rearRightPlate.x };
  const rearLeftWheel = { ...rearRightWheel, x: 1 - rearRightWheel.x };
  const frontLeftPlate = { ...rearLeftPlate, y: rearLeftPlate.y + 0.04 };
  const frontLeftWheel = { ...rearLeftWheel, y: rearLeftWheel.y };
  const frontRightPlate = { ...rearRightPlate, y: rearRightPlate.y + 0.04 };
  const frontRightWheel = { ...rearRightWheel, y: rearRightWheel.y };

  return {
    'front-left': createTargetLayout(vehicleId, 'front-left', frontLeftPlate, frontLeftWheel),
    'front-right': createTargetLayout(vehicleId, 'front-right', frontRightPlate, frontRightWheel),
    'rear-left': createTargetLayout(vehicleId, 'rear-left', rearLeftPlate, rearLeftWheel),
    'rear-right': createTargetLayout(vehicleId, 'rear-right', rearRightPlate, rearRightWheel),
  };
}

const YARIS_PLATE_WIDTH = 0.22;
const YARIS_PLATE_HEIGHT = 0.08;
const YARIS_PLATE_TOLERANCE_X = 0.045;
const YARIS_PLATE_TOLERANCE_Y = 0.035;
const YARIS_WHEEL_WIDTH = 0.20;
const YARIS_WHEEL_HEIGHT = 0.20;
const YARIS_WHEEL_TOLERANCE_X = 0.055;
const YARIS_WHEEL_TOLERANCE_Y = 0.055;

// TODO: Replace these temporary width, height, and tolerance values with
// Calibration Tool output for each Yaris capture angle.
function createYarisPlateRegion(x: number, y: number): TargetRegion {
  return createRegion(
    x,
    y,
    YARIS_PLATE_WIDTH,
    YARIS_PLATE_HEIGHT,
    YARIS_PLATE_TOLERANCE_X,
    YARIS_PLATE_TOLERANCE_Y,
  );
}

function createYarisWheelRegion(x: number, y: number): TargetRegion {
  return createRegion(
    x,
    y,
    YARIS_WHEEL_WIDTH,
    YARIS_WHEEL_HEIGHT,
    YARIS_WHEEL_TOLERANCE_X,
    YARIS_WHEEL_TOLERANCE_Y,
  );
}

function createYarisManualBaselineLayout(
  captureAngle: CaptureAngle,
  plateX: number,
  plateY: number,
  wheelX: number,
  wheelY: number,
): TargetLayout {
  const layout = createTargetLayout(
    'yaris',
    captureAngle,
    createYarisPlateRegion(plateX, plateY),
    createYarisWheelRegion(wheelX, wheelY),
  );

  return {
    ...layout,
    metadata: {
      vehicleId: 'yaris',
      captureAngle,
      schemaVersion: 2,
      calibrationSampleCount: 1,
      calibrationSource: 'manual-baseline',
    },
  };
}

const YARIS_CAPTURE_LAYOUTS: Record<CaptureAngle, TargetLayout> = {
  'front-left': createYarisManualBaselineLayout(
    'front-left',
    0.206,
    0.704,
    0.716,
    0.704,
  ),
  'front-right': createYarisManualBaselineLayout(
    'front-right',
    0.818,
    0.755,
    0.335,
    0.731,
  ),
  'rear-left': createYarisManualBaselineLayout(
    'rear-left',
    0.753,
    0.636,
    0.320,
    0.735,
  ),
  'rear-right': createYarisManualBaselineLayout(
    'rear-right',
    0.320,
    0.735,
    0.730,
    0.814,
  ),
};

/**
 * Vehicle-specific target defaults. These are seed layouts only; production
 * values should be replaced with TargetLayouts generated from calibration data.
 */
export const VEHICLE_PROFILES: readonly VehicleProfile[] = [
  {
    vehicleId: 'yaris',
    displayName: 'Toyota Yaris',
    aspectRatio: 1.78,
    inspectionSequence: ['front-left', 'front-right', 'rear-left', 'rear-right'],
    captureLayouts: YARIS_CAPTURE_LAYOUTS,
  },
  {
    vehicleId: 'corolla-cross',
    displayName: 'Corolla Cross',
    aspectRatio: 1.78,
    inspectionSequence: ['front-left', 'front-right', 'rear-left', 'rear-right'],
    captureLayouts: standardLayouts(
      'corolla-cross',
      createRegion(0.58, 0.48, 0.24, 0.09, 0.05, 0.04),
      createRegion(0.34, 0.72, 0.21, 0.21, 0.055, 0.055),
    ),
  },
  {
    vehicleId: 'altis',
    displayName: 'Toyota Altis',
    aspectRatio: 1.82,
    inspectionSequence: ['front-left', 'front-right', 'rear-left', 'rear-right'],
    captureLayouts: standardLayouts(
      'altis',
      createRegion(0.6, 0.48, 0.23, 0.08, 0.045, 0.035),
      createRegion(0.33, 0.72, 0.2, 0.2, 0.055, 0.055),
    ),
  },
  {
    vehicleId: 'camry',
    displayName: 'Camry',
    aspectRatio: 1.85,
    inspectionSequence: ['front-left', 'front-right', 'rear-left', 'rear-right'],
    captureLayouts: standardLayouts(
      'camry',
      createRegion(0.6, 0.47, 0.24, 0.08, 0.05, 0.04),
      createRegion(0.33, 0.73, 0.2, 0.2, 0.055, 0.055),
    ),
  },
  {
    vehicleId: 'yaris-cross',
    displayName: 'Yaris Cross',
    aspectRatio: 1.76,
    inspectionSequence: ['front-left', 'front-right', 'rear-left', 'rear-right'],
    captureLayouts: standardLayouts(
      'yaris-cross',
      createRegion(0.57, 0.49, 0.23, 0.09, 0.05, 0.04),
      createRegion(0.35, 0.71, 0.21, 0.21, 0.055, 0.055),
    ),
  },
];

/** Returns one registered vehicle profile by its stable identifier. */
export function getVehicleProfile(vehicleId: VehicleId): VehicleProfile {
  const profile = VEHICLE_PROFILES.find((candidate) => candidate.vehicleId === vehicleId);

  if (profile === undefined) {
    throw new Error(`Unknown vehicle profile: ${vehicleId}`);
  }

  return profile;
}

export function findVehicleProfile(vehicleId: string): VehicleProfile | undefined {
  return VEHICLE_PROFILES.find((candidate) => candidate.vehicleId === vehicleId);
}
