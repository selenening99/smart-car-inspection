import { AutoCaptureState, type AutoCaptureController } from '../capture/AutoCaptureController';
import type { UploadCapturedImageInput } from '../capture/uploadCapturedImage';
import type { GuidanceState } from '../guide/GuidanceEngine';
import type { CaptureAngle, ResolvedTargetLayout } from '../guide/TargetLayout';
import type { VehicleId } from '../guide/VehicleProfiles';

export const CAMERA_CAPTURE_ANGLES: readonly CaptureAngle[] = [
  'front-left',
  'front-right',
  'rear-left',
  'rear-right',
];

export const CAMERA_FACING_MODE = 'environment';
export const CAMERA_PREVIEW_MIRRORED = false;

export interface AngleCoordinateReference {
  plate: {
    x: number;
    y: number;
  };
  wheel: {
    x: number;
    y: number;
  };
}

/**
 * Development-only reference table for validating that the selected UI angle
 * matches the explicit Yaris baseline layout. Runtime guidance must continue
 * to read TargetLayout through getTargetLayout().
 */
export const YARIS_ANGLE_COORDINATE_REFERENCE: Readonly<Record<CaptureAngle, AngleCoordinateReference>> = {
  'front-left': {
    plate: { x: 0.206, y: 0.704 },
    wheel: { x: 0.716, y: 0.704 },
  },
  'front-right': {
    plate: { x: 0.818, y: 0.755 },
    wheel: { x: 0.335, y: 0.731 },
  },
  'rear-left': {
    plate: { x: 0.753, y: 0.636 },
    wheel: { x: 0.320, y: 0.735 },
  },
  'rear-right': {
    plate: { x: 0.320, y: 0.735 },
    wheel: { x: 0.730, y: 0.814 },
  },
};

export interface AngleLayoutGuard {
  valid: boolean;
  error?: string;
}

export function validateSelectedAngleLayout(
  selectedAngle: CaptureAngle,
  layout: Pick<ResolvedTargetLayout, 'metadata'>,
): AngleLayoutGuard {
  const layoutAngle = layout.metadata?.captureAngle;

  if (layoutAngle === selectedAngle) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `TargetLayout angle mismatch: selected ${selectedAngle}, metadata ${layoutAngle ?? 'missing'}.`,
  };
}

export function resetAngleDependentCaptureState(
  controller: AutoCaptureController | null,
): AutoCaptureState {
  if (controller === null) {
    return AutoCaptureState.Idle;
  }

  return controller.reset();
}

export interface CreateCapturedImageUploadInputParams {
  blob: Blob;
  vehicleId: VehicleId;
  selectedAngle: CaptureAngle;
  captureSource: UploadCapturedImageInput['captureSource'];
  guidance: GuidanceState | undefined;
  targetLayout: ResolvedTargetLayout;
  capturedAt: string;
}

export function createCapturedImageUploadInput({
  blob,
  vehicleId,
  selectedAngle,
  captureSource,
  guidance,
  targetLayout,
  capturedAt,
}: CreateCapturedImageUploadInputParams): UploadCapturedImageInput {
  return {
    blob,
    vehicleId,
    captureAngle: selectedAngle,
    captureSource,
    guidanceScore: guidance?.overallScore ?? 0,
    plateCenter: guidance?.plateCurrent,
    wheelCenter: guidance?.wheelCurrent,
    targetPlateCenter: guidance?.plateTarget ?? { x: targetLayout.plate.x, y: targetLayout.plate.y },
    targetWheelCenter: guidance?.wheelTarget ?? { x: targetLayout.wheel.x, y: targetLayout.wheel.y },
    capturedAt,
  };
}
