import type { CalibrationObservation } from './CalibrationObservation';
import { angularDifference, angularStatistics, scalarStatistics } from './CalibrationStatistics';

export interface CalibrationOutlierResult {
  observation: CalibrationObservation;
  included: boolean;
  reasons: string[];
}

export interface CalibrationOutlierAnalysis {
  results: CalibrationOutlierResult[];
  included: CalibrationObservation[];
  excluded: CalibrationOutlierResult[];
}

const OUTLIER_MAD_MULTIPLIER = 3;
const MINIMUM_SPREAD = 0.0001;

function isScalarOutlier(value: number, median: number, scaledMad: number): boolean {
  return Math.abs(value - median) > OUTLIER_MAD_MULTIPLIER * Math.max(scaledMad, MINIMUM_SPREAD);
}

function buildScalarStats(observations: readonly CalibrationObservation[]): Record<string, ReturnType<typeof scalarStatistics>> {
  return {
    plateCenterX: scalarStatistics(observations.map((observation) => observation.plate.centerX)),
    plateCenterY: scalarStatistics(observations.map((observation) => observation.plate.centerY)),
    wheelCenterX: scalarStatistics(observations.map((observation) => observation.wheel.centerX)),
    wheelCenterY: scalarStatistics(observations.map((observation) => observation.wheel.centerY)),
    pairMidpointX: scalarStatistics(observations.map((observation) => observation.pair.midpointX)),
    pairMidpointY: scalarStatistics(observations.map((observation) => observation.pair.midpointY)),
    pairDx: scalarStatistics(observations.map((observation) => observation.pair.dx)),
    pairDy: scalarStatistics(observations.map((observation) => observation.pair.dy)),
    pairDistance: scalarStatistics(observations.map((observation) => observation.pair.distance)),
  };
}

export function detectCalibrationOutliers(
  observations: readonly CalibrationObservation[],
): CalibrationOutlierAnalysis {
  if (observations.length === 0) {
    return { results: [], included: [], excluded: [] };
  }

  const scalarStats = buildScalarStats(observations);
  const angleStats = angularStatistics(observations.map((observation) => observation.pair.angleRadians));
  const results = observations.map((observation): CalibrationOutlierResult => {
    const reasons: string[] = [];
    const checks: Array<[string, number, string]> = [
      ['plateCenterX', observation.plate.centerX, 'plate center x outlier'],
      ['plateCenterY', observation.plate.centerY, 'plate center y outlier'],
      ['wheelCenterX', observation.wheel.centerX, 'wheel center x outlier'],
      ['wheelCenterY', observation.wheel.centerY, 'wheel center y outlier'],
      ['pairMidpointX', observation.pair.midpointX, 'pair midpoint x outlier'],
      ['pairMidpointY', observation.pair.midpointY, 'pair midpoint y outlier'],
      ['pairDx', observation.pair.dx, 'pair dx outlier'],
      ['pairDy', observation.pair.dy, 'pair dy outlier'],
      ['pairDistance', observation.pair.distance, 'pair distance outlier'],
    ];

    for (const [key, value, reason] of checks) {
      const stats = scalarStats[key];

      if (stats !== undefined && isScalarOutlier(value, stats.median, stats.scaledMad)) {
        reasons.push(reason);
      }
    }

    if (Math.abs(angularDifference(observation.pair.angleRadians, angleStats.center)) > OUTLIER_MAD_MULTIPLIER * Math.max(angleStats.scaledMad, MINIMUM_SPREAD)) {
      reasons.push('pair angle outlier');
    }

    return {
      observation,
      included: reasons.length === 0,
      reasons,
    };
  });
  const included = results.filter((result) => result.included).map((result) => result.observation);
  const excluded = results.filter((result) => !result.included);

  return { results, included, excluded };
}
