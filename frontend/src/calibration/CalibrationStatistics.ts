export interface ScalarStatistics {
  median: number;
  scaledMad: number;
  min: number;
  max: number;
  sampleCount: number;
}

export interface AngularStatistics extends ScalarStatistics {
  center: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot calculate median for an empty sample.');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function robustSpread(values: readonly number[]): number {
  const center = median(values);
  const absoluteDeviations = values.map((value) => Math.abs(value - center));

  return median(absoluteDeviations) * 1.4826;
}

export function scalarStatistics(values: readonly number[]): ScalarStatistics {
  return {
    median: median(values),
    scaledMad: robustSpread(values),
    min: Math.min(...values),
    max: Math.max(...values),
    sampleCount: values.length,
  };
}

export function wrapRadians(angle: number): number {
  let wrapped = angle;

  while (wrapped > Math.PI) {
    wrapped -= Math.PI * 2;
  }

  while (wrapped <= -Math.PI) {
    wrapped += Math.PI * 2;
  }

  return wrapped;
}

export function angularDifference(angle: number, center: number): number {
  return wrapRadians(angle - center);
}

export function angularStatistics(values: readonly number[]): AngularStatistics {
  if (values.length === 0) {
    throw new Error('Cannot calculate angular statistics for an empty sample.');
  }

  const sinSum = values.reduce((sum, value) => sum + Math.sin(value), 0);
  const cosSum = values.reduce((sum, value) => sum + Math.cos(value), 0);
  const circularMean = Math.atan2(sinSum / values.length, cosSum / values.length);
  const unwrapped = values.map((value) => circularMean + angularDifference(value, circularMean));
  const center = wrapRadians(median(unwrapped));
  const deviations = values.map((value) => Math.abs(angularDifference(value, center)));

  return {
    median: center,
    center,
    scaledMad: median(deviations) * 1.4826,
    min: Math.min(...unwrapped),
    max: Math.max(...unwrapped),
    sampleCount: values.length,
  };
}
