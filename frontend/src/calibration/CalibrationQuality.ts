export interface CalibrationQualityReport {
  sampleCount: number;
  includedSampleCount: number;
  outlierCount: number;
  plateCenterSpreadX: number;
  plateCenterSpreadY: number;
  wheelCenterSpreadX: number;
  wheelCenterSpreadY: number;
  plateWidthSpread: number;
  plateHeightSpread: number;
  wheelWidthSpread: number;
  wheelHeightSpread: number;
  pairDistanceSpread: number;
  pairAngleSpread: number;
  quality: 'insufficient' | 'unstable' | 'acceptable' | 'good';
  warnings: string[];
}

export const MINIMUM_INCLUDED_SAMPLES = 15;
export const RECOMMENDED_MINIMUM_SAMPLES = 30;
export const GOOD_SAMPLE_COUNT = 50;
export const ACCEPTABLE_CENTER_SPREAD = 0.035;
export const GOOD_CENTER_SPREAD = 0.02;
export const ACCEPTABLE_ANGLE_SPREAD = 0.16;
export const GOOD_ANGLE_SPREAD = 0.09;

export interface BuildCalibrationQualityInput extends Omit<CalibrationQualityReport, 'quality' | 'warnings'> {}

export function buildCalibrationQualityReport(input: BuildCalibrationQualityInput): CalibrationQualityReport {
  const warnings: string[] = [];
  const maximumCenterSpread = Math.max(
    input.plateCenterSpreadX,
    input.plateCenterSpreadY,
    input.wheelCenterSpreadX,
    input.wheelCenterSpreadY,
  );
  let quality: CalibrationQualityReport['quality'] = 'acceptable';

  if (input.includedSampleCount < MINIMUM_INCLUDED_SAMPLES) {
    quality = 'insufficient';
    warnings.push('有效樣本少於 15 筆，校正結果不足。');
  } else if (input.includedSampleCount < RECOMMENDED_MINIMUM_SAMPLES) {
    quality = 'unstable';
    warnings.push('有效樣本少於 30 筆，TargetLayout 可能不穩定。');
  } else if (
    input.includedSampleCount >= GOOD_SAMPLE_COUNT
    && maximumCenterSpread <= GOOD_CENTER_SPREAD
    && input.pairAngleSpread <= GOOD_ANGLE_SPREAD
  ) {
    quality = 'good';
  } else if (maximumCenterSpread > ACCEPTABLE_CENTER_SPREAD || input.pairAngleSpread > ACCEPTABLE_ANGLE_SPREAD) {
    quality = 'unstable';
    warnings.push('樣本分布過大，建議重新檢查拍攝角度或排除離群樣本。');
  }

  return {
    ...input,
    quality,
    warnings,
  };
}
