import type { CalibrationObservation } from './CalibrationObservation';
import type { CalibrationGenerationResult } from './TargetLayoutGenerator';
import type { CaptureAngle, TargetLayout } from '../guide/TargetLayout';

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

function targetRegionTs(name: string, region: TargetLayout['plate']): string {
  return `  ${name}: {
    x: ${formatNumber(region.x)},
    y: ${formatNumber(region.y)},
    width: ${formatNumber(region.width)},
    height: ${formatNumber(region.height)},
    toleranceX: ${formatNumber(region.toleranceX)},
    toleranceY: ${formatNumber(region.toleranceY)}
  }`;
}

export function exportRawCalibrationObservations(observations: readonly CalibrationObservation[]): string {
  return JSON.stringify(observations, null, 2);
}

export function exportGeneratedTargetLayout(result: CalibrationGenerationResult): string {
  return JSON.stringify(result.layout, null, 2);
}

export function exportCalibrationQualityReport(result: CalibrationGenerationResult): string {
  return JSON.stringify(result.quality, null, 2);
}

export function exportTargetLayoutTypeScript(captureAngle: CaptureAngle, layout: TargetLayout): string {
  return `'${captureAngle}': {
${targetRegionTs('plate', layout.plate)},
${targetRegionTs('wheel', layout.wheel)},
  relation: {
    dx: ${formatNumber(layout.relation?.dx ?? layout.wheel.x - layout.plate.x)},
    dy: ${formatNumber(layout.relation?.dy ?? layout.wheel.y - layout.plate.y)},
    distance: ${formatNumber(layout.relation?.distance ?? Math.hypot(layout.wheel.x - layout.plate.x, layout.wheel.y - layout.plate.y))},
    angleRadians: ${formatNumber(layout.relation?.angleRadians ?? Math.atan2(layout.wheel.y - layout.plate.y, layout.wheel.x - layout.plate.x))}
  },
  expectedVehicleSize: {
    width: ${formatNumber(layout.expectedVehicleSize?.width ?? 0)},
    height: ${formatNumber(layout.expectedVehicleSize?.height ?? 0)}
  },
  tolerances: {
    translationX: ${formatNumber(layout.tolerances?.translationX ?? 0)},
    translationY: ${formatNumber(layout.tolerances?.translationY ?? 0)},
    scale: ${formatNumber(layout.tolerances?.scale ?? 0)},
    angleRadians: ${formatNumber(layout.tolerances?.angleRadians ?? 0)},
    plateFineX: ${formatNumber(layout.tolerances?.plateFineX ?? 0)},
    plateFineY: ${formatNumber(layout.tolerances?.plateFineY ?? 0)},
    wheelFineX: ${formatNumber(layout.tolerances?.wheelFineX ?? 0)},
    wheelFineY: ${formatNumber(layout.tolerances?.wheelFineY ?? 0)}
  },
  metadata: ${JSON.stringify(layout.metadata ?? {}, null, 2).replaceAll('\n', '\n  ')}
}`;
}
