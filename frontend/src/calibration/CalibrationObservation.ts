import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import type { WheelSelectionDebug } from '../guide/GuidanceEngine';
import { calculateCurrentPairGeometry, type NormalizedPoint } from '../guide/GuidanceEngine';
import type { CaptureAngle } from '../guide/TargetLayout';
import type { VehicleId } from '../guide/VehicleProfiles';

export interface CalibrationDetectionRegion {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  confidence: number;
}

export interface CalibrationPairGeometry {
  midpointX: number;
  midpointY: number;
  dx: number;
  dy: number;
  distance: number;
  angleRadians: number;
}

export interface CalibrationObservation {
  id: string;
  vehicleId: VehicleId | string;
  vehicleDisplayName: string;
  captureAngle: CaptureAngle;
  capturedAt: string;
  imageWidth: number;
  imageHeight: number;
  plate: CalibrationDetectionRegion;
  wheel: CalibrationDetectionRegion;
  pair: CalibrationPairGeometry;
  wheelSelection: WheelSelectionDebug;
  source: 'live-camera' | 'uploaded-image';
  accepted: boolean;
  rejectionReason?: string;
}

export interface BuildCalibrationObservationInput {
  id: string;
  vehicleId: VehicleId | string;
  vehicleDisplayName: string;
  captureAngle: CaptureAngle;
  capturedAt: string;
  imageWidth: number;
  imageHeight: number;
  detections: readonly BoxDetection[];
  targetWheel: NormalizedPoint;
  source: CalibrationObservation['source'];
  accepted: boolean;
  rejectionReason?: string;
  confidenceThreshold: number;
}

export function normalizeDetectionRegion(
  detection: BoxDetection,
  imageWidth: number,
  imageHeight: number,
): CalibrationDetectionRegion {
  return {
    centerX: ((detection.x1 + detection.x2) / 2) / imageWidth,
    centerY: ((detection.y1 + detection.y2) / 2) / imageHeight,
    width: (detection.x2 - detection.x1) / imageWidth,
    height: (detection.y2 - detection.y1) / imageHeight,
    confidence: detection.confidence,
  };
}

export function createCalibrationPairGeometry(
  plate: Pick<CalibrationDetectionRegion, 'centerX' | 'centerY'>,
  wheel: Pick<CalibrationDetectionRegion, 'centerX' | 'centerY'>,
): CalibrationPairGeometry {
  const dx = wheel.centerX - plate.centerX;
  const dy = wheel.centerY - plate.centerY;

  return {
    midpointX: (plate.centerX + wheel.centerX) / 2,
    midpointY: (plate.centerY + wheel.centerY) / 2,
    dx,
    dy,
    distance: Math.hypot(dx, dy),
    angleRadians: Math.atan2(dy, dx),
  };
}

export function buildCalibrationObservationFromDetections(
  input: BuildCalibrationObservationInput,
): CalibrationObservation {
  if (input.imageWidth <= 0 || input.imageHeight <= 0) {
    throw new Error('Image dimensions must be positive before saving a calibration sample.');
  }

  const current = calculateCurrentPairGeometry(
    input.detections,
    input.imageWidth,
    input.imageHeight,
    input.targetWheel,
  );

  if (current.plateDetection === undefined) {
    throw new Error('尚未偵測到車牌');
  }

  if (current.wheelDetection === undefined) {
    throw new Error('尚未偵測到輪胎');
  }

  if (
    current.plateDetection.confidence < input.confidenceThreshold
    || current.wheelDetection.confidence < input.confidenceThreshold
  ) {
    throw new Error('信心值低於門檻');
  }

  const plate = normalizeDetectionRegion(current.plateDetection, input.imageWidth, input.imageHeight);
  const wheel = normalizeDetectionRegion(current.wheelDetection, input.imageWidth, input.imageHeight);

  return {
    id: input.id,
    vehicleId: input.vehicleId,
    vehicleDisplayName: input.vehicleDisplayName,
    captureAngle: input.captureAngle,
    capturedAt: input.capturedAt,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    plate,
    wheel,
    pair: createCalibrationPairGeometry(plate, wheel),
    wheelSelection: current.wheelSelection,
    source: input.source,
    accepted: input.accepted,
    rejectionReason: input.rejectionReason,
  };
}

export function isCalibrationObservation(value: unknown): value is CalibrationObservation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CalibrationObservation>;

  return typeof candidate.id === 'string'
    && typeof candidate.vehicleId === 'string'
    && typeof candidate.vehicleDisplayName === 'string'
    && typeof candidate.captureAngle === 'string'
    && typeof candidate.capturedAt === 'string'
    && typeof candidate.imageWidth === 'number'
    && typeof candidate.imageHeight === 'number'
    && typeof candidate.accepted === 'boolean'
    && candidate.plate !== undefined
    && candidate.wheel !== undefined
    && candidate.pair !== undefined
    && candidate.wheelSelection !== undefined;
}
