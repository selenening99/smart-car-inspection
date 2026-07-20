import { deriveTargetRelation, resolveTargetLayout, type TargetLayout, type TargetRegion } from '../guide/TargetLayout';
import type { CaptureAngle } from '../guide/TargetLayout';
import type { VehicleId } from '../guide/VehicleProfiles';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface VehicleSize {
  width: number;
  height: number;
}

export interface CalibrationObservation {
  imageName: string;
  plate: NormalizedPoint;
  wheel: NormalizedPoint;
  vehicleSize: VehicleSize;
  plateConfidence: number;
  wheelConfidence: number;
  qualityScore: number;
  /** Milliseconds spent evaluating image quality for this accepted image. */
  qualityTime: number;
  /** Milliseconds spent preparing and running ONNX inference. */
  inferenceTime: number;
  /** Milliseconds spent decoding, filtering, NMS, and coordinate recovery. */
  postprocessTime: number;
  /** Milliseconds spent loading and processing this accepted dataset image. */
  totalTime: number;
}

export interface ConfidenceRange {
  lower: number;
  upper: number;
}

export interface AxisStatistics {
  mean: number;
  weightedMean: number;
  median: number;
  standardDeviation: number;
  confidence95: ConfidenceRange;
}

export interface PointStatistics {
  x: AxisStatistics;
  y: AxisStatistics;
}

export interface HeatmapCell {
  xIndex: number;
  yIndex: number;
  count: number;
}

export interface DatasetLayoutRecommendation {
  vehicleId: VehicleId;
  captureAngle: CaptureAngle;
  observations: readonly CalibrationObservation[];
  validObservations: readonly CalibrationObservation[];
  rejectedOutliers: readonly OutlierObservation[];
  outlierDistanceThreshold: number;
  includeOutliers: boolean;
  meanMode: MeanMode;
  targetLayout: TargetLayout;
  plateStatistics: PointStatistics;
  wheelStatistics: PointStatistics;
  vehicleSizeStatistics: {
    width: AxisStatistics;
    height: AxisStatistics;
  };
  expectedVehicleSize: VehicleSize;
  plateConfidenceEllipse: ConfidenceEllipse;
  wheelConfidenceEllipse: ConfidenceEllipse;
  plateHeatmap: HeatmapCell[];
  wheelHeatmap: HeatmapCell[];
}

export interface OutlierObservation {
  observation: CalibrationObservation;
  plateDistance: number;
  wheelDistance: number;
}

/** A 95% confidence ellipse in normalized image coordinates. */
export interface ConfidenceEllipse {
  majorAxis: number;
  minorAxis: number;
  rotation: number;
}

export interface EllipseTargetPoint {
  x: number;
  y: number;
  majorAxis: number;
  minorAxis: number;
  rotation: number;
}

export interface EllipseTargetLayout {
  plate: EllipseTargetPoint;
  wheel: EllipseTargetPoint;
}

export interface OutlierAnalysis {
  validObservations: readonly CalibrationObservation[];
  rejectedOutliers: readonly OutlierObservation[];
  outlierDistanceThreshold: number;
}

export interface DatasetAnalysisOptions {
  /** Normalized radial distance from a median target before rejection. */
  outlierDistanceThreshold?: number;
  /** Uses all observations for statistics instead of only valid observations. */
  includeOutliers?: boolean;
  /** Selects whether recommended target positions use regular or weighted means. */
  meanMode?: MeanMode;
}

export type MeanMode = 'mean' | 'weightedMean';

export interface VehicleLayoutExport {
  vehicleProfile: VehicleId;
  captureLayouts: Partial<Record<CaptureAngle, TargetLayout | EllipseTargetLayout>>;
}

/** Calculates descriptive statistics and a mean ± 1.96σ confidence range. */
export function calculateAxisStatistics(values: number[], weights?: number[]): AxisStatistics {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const totalWeight = weights?.reduce((sum, weight) => sum + weight, 0) ?? 0;
  const weightedMean = weights === undefined || totalWeight === 0
    ? mean
    : values.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0) / totalWeight;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const standardDeviation = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
  );

  return {
    mean,
    weightedMean,
    median,
    standardDeviation,
    confidence95: {
      lower: Math.max(0, mean - 1.96 * standardDeviation),
      upper: Math.min(1, mean + 1.96 * standardDeviation),
    },
  };
}

/** Bins normalized points into a square heatmap grid for rendering. */
export function createHeatmap(points: NormalizedPoint[], binCount: number = 10): HeatmapCell[] {
  const counts = new Map<string, number>();

  for (const point of points) {
    const xIndex = Math.min(binCount - 1, Math.max(0, Math.floor(point.x * binCount)));
    const yIndex = Math.min(binCount - 1, Math.max(0, Math.floor(point.y * binCount)));
    const key = `${xIndex}:${yIndex}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([key, count]) => {
    const [xIndex, yIndex] = key.split(':').map(Number);
    return { xIndex, yIndex, count };
  });
}

/**
 * Derives a 95% confidence ellipse from the unweighted covariance matrix of
 * normalized points around the selected target center. Rotation is in radians.
 */
export function calculateConfidenceEllipse(
  points: NormalizedPoint[],
  center: NormalizedPoint,
): ConfidenceEllipse {
  const covariance = points.reduce(
    (result, point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;

      return {
        xx: result.xx + dx * dx,
        xy: result.xy + dx * dy,
        yy: result.yy + dy * dy,
      };
    },
    { xx: 0, xy: 0, yy: 0 },
  );
  const covarianceXX = covariance.xx / points.length;
  const covarianceXY = covariance.xy / points.length;
  const covarianceYY = covariance.yy / points.length;
  const trace = covarianceXX + covarianceYY;
  const determinant = covarianceXX * covarianceYY - covarianceXY ** 2;
  const discriminant = Math.sqrt(Math.max(0, trace ** 2 / 4 - determinant));
  const majorEigenvalue = trace / 2 + discriminant;
  const minorEigenvalue = trace / 2 - discriminant;

  return {
    majorAxis: Math.max(0.01, Math.sqrt(Math.max(0, majorEigenvalue)) * 1.96),
    minorAxis: Math.max(0.01, Math.sqrt(Math.max(0, minorEigenvalue)) * 1.96),
    rotation: Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY) / 2,
  };
}

/**
 * Classifies observations against median plate and wheel targets. An image is
 * an outlier when either normalized radial distance exceeds the configured
 * threshold.
 */
export function classifyOutliers(
  observations: CalibrationObservation[],
  outlierDistanceThreshold: number = 0.15,
): OutlierAnalysis {
  const plateMedianTarget: NormalizedPoint = {
    x: calculateAxisStatistics(observations.map((observation) => observation.plate.x)).median,
    y: calculateAxisStatistics(observations.map((observation) => observation.plate.y)).median,
  };
  const wheelMedianTarget: NormalizedPoint = {
    x: calculateAxisStatistics(observations.map((observation) => observation.wheel.x)).median,
    y: calculateAxisStatistics(observations.map((observation) => observation.wheel.y)).median,
  };
  const validObservations: CalibrationObservation[] = [];
  const rejectedOutliers: OutlierObservation[] = [];

  for (const observation of observations) {
    const plateDistance = Math.hypot(
      observation.plate.x - plateMedianTarget.x,
      observation.plate.y - plateMedianTarget.y,
    );
    const wheelDistance = Math.hypot(
      observation.wheel.x - wheelMedianTarget.x,
      observation.wheel.y - wheelMedianTarget.y,
    );

    if (plateDistance > outlierDistanceThreshold || wheelDistance > outlierDistanceThreshold) {
      rejectedOutliers.push({ observation, plateDistance, wheelDistance });
    } else {
      validObservations.push(observation);
    }
  }

  return {
    validObservations: Object.freeze(validObservations.map((observation) => Object.freeze({ ...observation }))),
    rejectedOutliers: Object.freeze(rejectedOutliers.map((outlier) => Object.freeze({
      ...outlier,
      observation: Object.freeze({ ...outlier.observation }),
    }))),
    outlierDistanceThreshold,
  };
}

/** Converts observations for one vehicle/capture angle into a reviewable layout recommendation. */
export function recommendVehicleLayout(
  vehicleId: VehicleId,
  captureAngle: CaptureAngle,
  observations: CalibrationObservation[],
  options: DatasetAnalysisOptions = {},
): DatasetLayoutRecommendation {
  const outlierDistanceThreshold = options.outlierDistanceThreshold ?? 0.15;
  const includeOutliers = options.includeOutliers ?? false;
  const meanMode = options.meanMode ?? 'mean';
  const outlierAnalysis = classifyOutliers(observations, outlierDistanceThreshold);
  const analysisObservations = includeOutliers ? observations : outlierAnalysis.validObservations;

  if (analysisObservations.length === 0) {
    throw new Error('No valid observations remain after outlier filtering.');
  }

  const plateStatistics: PointStatistics = {
    x: calculateAxisStatistics(
      analysisObservations.map((observation) => observation.plate.x),
      analysisObservations.map((observation) => observation.plateConfidence * observation.qualityScore),
    ),
    y: calculateAxisStatistics(
      analysisObservations.map((observation) => observation.plate.y),
      analysisObservations.map((observation) => observation.plateConfidence * observation.qualityScore),
    ),
  };
  const wheelStatistics: PointStatistics = {
    x: calculateAxisStatistics(
      analysisObservations.map((observation) => observation.wheel.x),
      analysisObservations.map((observation) => observation.wheelConfidence * observation.qualityScore),
    ),
    y: calculateAxisStatistics(
      analysisObservations.map((observation) => observation.wheel.y),
      analysisObservations.map((observation) => observation.wheelConfidence * observation.qualityScore),
    ),
  };
  const vehicleSizeStatistics = {
    width: calculateAxisStatistics(
      analysisObservations.map((observation) => observation.vehicleSize.width),
      analysisObservations.map((observation) => (observation.plateConfidence + observation.wheelConfidence) / 2 * observation.qualityScore),
    ),
    height: calculateAxisStatistics(
      analysisObservations.map((observation) => observation.vehicleSize.height),
      analysisObservations.map((observation) => (observation.plateConfidence + observation.wheelConfidence) / 2 * observation.qualityScore),
    ),
  };
  const targetFor = (statistics: PointStatistics, objectType: 'plate' | 'wheel'): TargetRegion => {
    const tolerance = Math.min(
      0.3,
      Math.max(0.01, Math.hypot(statistics.x.standardDeviation, statistics.y.standardDeviation) * 1.96),
    );

    return {
    x: statistics.x[meanMode],
    y: statistics.y[meanMode],
      width: objectType === 'plate' ? tolerance * 2.4 : tolerance * 2,
      height: objectType === 'plate' ? tolerance * 0.8 : tolerance * 2,
      toleranceX: tolerance,
      toleranceY: tolerance,
      tolerance,
    };
  };
  const plateTarget = targetFor(plateStatistics, 'plate');
  const wheelTarget = targetFor(wheelStatistics, 'wheel');
  const targetLayout: TargetLayout = {
    plate: plateTarget,
    wheel: wheelTarget,
    relation: deriveTargetRelation(plateTarget, wheelTarget),
    expectedVehicleSize: {
      width: vehicleSizeStatistics.width.median,
      height: vehicleSizeStatistics.height.median,
    },
  };
  const plateConfidenceEllipse = calculateConfidenceEllipse(
    analysisObservations.map((observation) => observation.plate),
    targetLayout.plate,
  );
  const wheelConfidenceEllipse = calculateConfidenceEllipse(
    analysisObservations.map((observation) => observation.wheel),
    targetLayout.wheel,
  );

  return {
    vehicleId,
    captureAngle,
    observations: Object.freeze(analysisObservations.map((observation) => Object.freeze({
      ...observation,
      plate: Object.freeze({ ...observation.plate }),
      wheel: Object.freeze({ ...observation.wheel }),
      vehicleSize: Object.freeze({ ...observation.vehicleSize }),
    }))),
    validObservations: outlierAnalysis.validObservations,
    rejectedOutliers: outlierAnalysis.rejectedOutliers,
    outlierDistanceThreshold,
    includeOutliers,
    meanMode,
    targetLayout,
    plateStatistics,
    wheelStatistics,
    vehicleSizeStatistics,
    expectedVehicleSize: {
      width: vehicleSizeStatistics.width.median,
      height: vehicleSizeStatistics.height.median,
    },
    plateConfidenceEllipse,
    wheelConfidenceEllipse,
    plateHeatmap: createHeatmap(observations.map((observation) => observation.plate)),
    wheelHeatmap: createHeatmap(observations.map((observation) => observation.wheel)),
  };
}

/** Produces the profile → capture angle → target layout export shape. */
export function createVehicleLayoutExport(
  vehicleId: VehicleId,
  captureAngle: CaptureAngle,
  targetLayout: TargetLayout,
  confidenceEllipses?: { plate: ConfidenceEllipse; wheel: ConfidenceEllipse },
): VehicleLayoutExport {
  const captureLayout = confidenceEllipses === undefined
    ? resolveTargetLayout(targetLayout)
    : {
        plate: {
          x: targetLayout.plate.x,
          y: targetLayout.plate.y,
          majorAxis: confidenceEllipses.plate.majorAxis,
          minorAxis: confidenceEllipses.plate.minorAxis,
          rotation: confidenceEllipses.plate.rotation,
        },
        wheel: {
          x: targetLayout.wheel.x,
          y: targetLayout.wheel.y,
          majorAxis: confidenceEllipses.wheel.majorAxis,
          minorAxis: confidenceEllipses.wheel.minorAxis,
          rotation: confidenceEllipses.wheel.rotation,
        },
      };

  return {
    vehicleProfile: vehicleId,
    captureLayouts: {
      [captureAngle]: captureLayout,
    },
  };
}
