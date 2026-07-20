import type { CalibrationObservation } from './CalibrationObservation';
import { detectCalibrationOutliers } from './CalibrationOutlierDetector';
import { angularStatistics, scalarStatistics } from './CalibrationStatistics';
import { buildCalibrationQualityReport, type CalibrationQualityReport } from './CalibrationQuality';
import { deriveTargetRelation, type CaptureAngle, type TargetLayout, type TargetRegion } from '../guide/TargetLayout';

export interface CalibrationGenerationResult {
  vehicleId: string;
  vehicleDisplayName: string;
  captureAngle: CaptureAngle;
  acceptedSampleCount: number;
  includedSampleCount: number;
  outlierCount: number;
  generatedAt: string;
  layout: TargetLayout;
  quality: CalibrationQualityReport;
}

const TOLERANCE_MULTIPLIER = 2.5;
const MINIMUM_CENTER_TOLERANCE = 0.015;
const MINIMUM_SIZE = 0.01;
const MINIMUM_SCALE_TOLERANCE = 0.015;
const MINIMUM_ANGLE_TOLERANCE = 0.04;

function toleranceFromSpread(spread: number, minimum: number): number {
  return Math.max(minimum, spread * TOLERANCE_MULTIPLIER);
}

function regionFromStats(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  centerSpreadX: number,
  centerSpreadY: number,
): TargetRegion {
  return {
    x: centerX,
    y: centerY,
    width: Math.max(MINIMUM_SIZE, width),
    height: Math.max(MINIMUM_SIZE, height),
    toleranceX: toleranceFromSpread(centerSpreadX, MINIMUM_CENTER_TOLERANCE),
    toleranceY: toleranceFromSpread(centerSpreadY, MINIMUM_CENTER_TOLERANCE),
  };
}

export function generateTargetLayout(
  observations: readonly CalibrationObservation[],
): CalibrationGenerationResult {
  const accepted = observations.filter((observation) => observation.accepted);

  if (accepted.length === 0) {
    throw new Error('At least one accepted calibration observation is required.');
  }

  const outliers = detectCalibrationOutliers(accepted);
  const included = outliers.included.length > 0 ? outliers.included : accepted;
  const midpointX = scalarStatistics(included.map((observation) => observation.pair.midpointX));
  const midpointY = scalarStatistics(included.map((observation) => observation.pair.midpointY));
  const dx = scalarStatistics(included.map((observation) => observation.pair.dx));
  const dy = scalarStatistics(included.map((observation) => observation.pair.dy));
  const plateWidth = scalarStatistics(included.map((observation) => observation.plate.width));
  const plateHeight = scalarStatistics(included.map((observation) => observation.plate.height));
  const wheelWidth = scalarStatistics(included.map((observation) => observation.wheel.width));
  const wheelHeight = scalarStatistics(included.map((observation) => observation.wheel.height));
  const plateCenterX = scalarStatistics(included.map((observation) => observation.plate.centerX));
  const plateCenterY = scalarStatistics(included.map((observation) => observation.plate.centerY));
  const wheelCenterX = scalarStatistics(included.map((observation) => observation.wheel.centerX));
  const wheelCenterY = scalarStatistics(included.map((observation) => observation.wheel.centerY));
  const pairDistance = scalarStatistics(included.map((observation) => observation.pair.distance));
  const pairAngle = angularStatistics(included.map((observation) => observation.pair.angleRadians));
  const plateCenter = {
    x: midpointX.median - dx.median / 2,
    y: midpointY.median - dy.median / 2,
  };
  const wheelCenter = {
    x: midpointX.median + dx.median / 2,
    y: midpointY.median + dy.median / 2,
  };
  const plate = regionFromStats(
    plateCenter.x,
    plateCenter.y,
    plateWidth.median,
    plateHeight.median,
    plateCenterX.scaledMad,
    plateCenterY.scaledMad,
  );
  const wheel = regionFromStats(
    wheelCenter.x,
    wheelCenter.y,
    wheelWidth.median,
    wheelHeight.median,
    wheelCenterX.scaledMad,
    wheelCenterY.scaledMad,
  );
  const relation = deriveTargetRelation(plate, wheel);
  const layout: TargetLayout = {
    plate,
    wheel,
    relation,
    expectedVehicleSize: {
      width: Math.max(plate.width, wheel.width, Math.abs(relation.dx) + (plate.width + wheel.width) / 2),
      height: Math.max(plate.height, wheel.height, Math.abs(relation.dy) + (plate.height + wheel.height) / 2),
    },
    tolerances: {
      translationX: toleranceFromSpread(midpointX.scaledMad, MINIMUM_CENTER_TOLERANCE),
      translationY: toleranceFromSpread(midpointY.scaledMad, MINIMUM_CENTER_TOLERANCE),
      scale: toleranceFromSpread(pairDistance.scaledMad, MINIMUM_SCALE_TOLERANCE),
      angleRadians: toleranceFromSpread(pairAngle.scaledMad, MINIMUM_ANGLE_TOLERANCE),
      plateFineX: plate.toleranceX,
      plateFineY: plate.toleranceY,
      wheelFineX: wheel.toleranceX,
      wheelFineY: wheel.toleranceY,
    },
    metadata: {
      vehicleId: accepted[0].vehicleId,
      captureAngle: accepted[0].captureAngle,
      generatedAt: new Date().toISOString(),
      calibrationSampleCount: included.length,
      schemaVersion: 2,
    },
  };
  const quality = buildCalibrationQualityReport({
    sampleCount: accepted.length,
    includedSampleCount: included.length,
    outlierCount: outliers.excluded.length,
    plateCenterSpreadX: plateCenterX.scaledMad,
    plateCenterSpreadY: plateCenterY.scaledMad,
    wheelCenterSpreadX: wheelCenterX.scaledMad,
    wheelCenterSpreadY: wheelCenterY.scaledMad,
    plateWidthSpread: plateWidth.scaledMad,
    plateHeightSpread: plateHeight.scaledMad,
    wheelWidthSpread: wheelWidth.scaledMad,
    wheelHeightSpread: wheelHeight.scaledMad,
    pairDistanceSpread: pairDistance.scaledMad,
    pairAngleSpread: pairAngle.scaledMad,
  });

  return {
    vehicleId: accepted[0].vehicleId,
    vehicleDisplayName: accepted[0].vehicleDisplayName,
    captureAngle: accepted[0].captureAngle,
    acceptedSampleCount: accepted.length,
    includedSampleCount: included.length,
    outlierCount: outliers.excluded.length,
    generatedAt: layout.metadata?.generatedAt ?? new Date().toISOString(),
    layout,
    quality,
  };
}
