import type {
  AxisStatistics,
  DatasetLayoutRecommendation,
  HeatmapCell,
  PointStatistics,
} from './DatasetLayoutAnalyzer';
import type { CaptureAngle } from '../guide/TargetLayout';
import type { VehicleId } from '../guide/VehicleProfiles';

export interface DatasetCalibrationReportInput {
  vehicleId: VehicleId;
  vehicleName: string;
  captureAngle: CaptureAngle;
  datasetSize: number;
  acceptedImages: number;
  rejectedImages: number;
  outlierImages: number;
  averageConfidence: number;
  averageQuality: number;
  recommendation: DatasetLayoutRecommendation;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatAngle(angle: CaptureAngle): string {
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

function statisticsRows(statistics: PointStatistics): string {
  const formatAxis = (axis: string, value: AxisStatistics): string => `
    <tr>
      <td>${axis}</td>
      <td>${value.mean.toFixed(4)}</td>
      <td>${value.weightedMean.toFixed(4)}</td>
      <td>${value.median.toFixed(4)}</td>
      <td>${value.standardDeviation.toFixed(4)}</td>
      <td>${value.confidence95.lower.toFixed(4)} – ${value.confidence95.upper.toFixed(4)}</td>
    </tr>`;

  return `${formatAxis('X', statistics.x)}${formatAxis('Y', statistics.y)}`;
}

function statisticsTable(title: string, statistics: PointStatistics): string {
  return `
    <section class="panel">
      <h3>${escapeHtml(title)}</h3>
      <table>
        <thead><tr><th>Axis</th><th>Mean</th><th>Weighted Mean</th><th>Median</th><th>Std. Dev.</th><th>95% Range</th></tr></thead>
        <tbody>${statisticsRows(statistics)}</tbody>
      </table>
    </section>`;
}

function scatterPlot(recommendation: DatasetLayoutRecommendation): string {
  const plate = recommendation.targetLayout.plate;
  const wheel = recommendation.targetLayout.wheel;
  const plateEllipse = recommendation.plateConfidenceEllipse;
  const wheelEllipse = recommendation.wheelConfidenceEllipse;
  const points = recommendation.observations.map((observation) => `
    <circle cx="${observation.plate.x * 600}" cy="${observation.plate.y * 600}" r="4" fill="#22c55e" fill-opacity="0.55" />
    <circle cx="${observation.wheel.x * 600}" cy="${observation.wheel.y * 600}" r="4" fill="#2563eb" fill-opacity="0.55" />`).join('');
  const grid = [0, 150, 300, 450, 600].map((position) => `
    <line x1="${position}" x2="${position}" y1="0" y2="600" />
    <line x1="0" x2="600" y1="${position}" y2="${position}" />`).join('');

  return `
    <section class="panel">
      <h3>Detected Center Scatter Plot</h3>
      <svg viewBox="0 0 600 600" role="img" aria-label="Plate and wheel center scatter plot">
        <g class="grid">${grid}</g>
        ${points}
        <ellipse cx="${plate.x * 600}" cy="${plate.y * 600}" rx="${plateEllipse.majorAxis * 600}" ry="${plateEllipse.minorAxis * 600}" transform="rotate(${plateEllipse.rotation * 180 / Math.PI} ${plate.x * 600} ${plate.y * 600})" class="plate-ellipse" />
        <ellipse cx="${wheel.x * 600}" cy="${wheel.y * 600}" rx="${wheelEllipse.majorAxis * 600}" ry="${wheelEllipse.minorAxis * 600}" transform="rotate(${wheelEllipse.rotation * 180 / Math.PI} ${wheel.x * 600} ${wheel.y * 600})" class="wheel-ellipse" />
        <rect x="${plate.x * 600 - 7}" y="${plate.y * 600 - 7}" width="14" height="14" fill="#22c55e" />
        <rect x="${wheel.x * 600 - 7}" y="${wheel.y * 600 - 7}" width="14" height="14" fill="#2563eb" />
      </svg>
      <p class="legend">Green: plate centers/target · Blue: wheel centers/target · Dashed ellipses: 95% confidence regions</p>
    </section>`;
}

function heatmap(cells: HeatmapCell[], color: string, title: string): string {
  const maximumCount = Math.max(1, ...cells.map((cell) => cell.count));
  const grid = Array.from({ length: 11 }, (_, index) => index * 40).map((position) => `
    <line x1="${position}" x2="${position}" y1="0" y2="400" />
    <line x1="0" x2="400" y1="${position}" y2="${position}" />`).join('');
  const cellsHtml = cells.map((cell) => `<rect x="${cell.xIndex * 40}" y="${cell.yIndex * 40}" width="40" height="40" fill="${color}" fill-opacity="${cell.count / maximumCount}" />`).join('');

  return `
    <section class="panel">
      <h3>${escapeHtml(title)}</h3>
      <svg viewBox="0 0 400 400" role="img" aria-label="${escapeHtml(title)} heatmap">
        <g class="grid">${grid}</g>
        ${cellsHtml}
      </svg>
    </section>`;
}

/**
 * Produces a self-contained engineering report. Open the returned HTML in a
 * browser and print it to obtain a PDF; print CSS fixes the report to A4 pages.
 */
export function generateDatasetCalibrationReport(input: DatasetCalibrationReportInput): string {
  const { recommendation } = input;
  const exportPayload = {
    vehicleProfile: input.vehicleId,
    captureLayouts: {
      [input.captureAngle]: recommendation.targetLayout,
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Calibration Report — ${escapeHtml(input.vehicleName)} ${escapeHtml(formatAngle(input.captureAngle))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { color: #111827; font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 12px; line-height: 1.45; margin: 0; }
  h1 { font-size: 24px; margin: 0; } h2 { font-size: 17px; margin: 26px 0 10px; } h3 { font-size: 14px; margin: 0 0 10px; }
  .subtitle, .legend { color: #4b5563; margin: 4px 0 0; } .summary { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); margin-top: 18px; }
  .metric, .panel { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; } .metric strong { display: block; font-size: 18px; }
  .grid-2 { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; margin-top: 14px; } .grid { stroke: #d1d5db; stroke-width: 1; }
  svg { background: #f9fafb; border: 1px solid #d1d5db; height: auto; max-width: 100%; } .plate-ellipse { fill: none; stroke: #16a34a; stroke-dasharray: 8 6; stroke-width: 2; } .wheel-ellipse { fill: none; stroke: #2563eb; stroke-dasharray: 8 6; stroke-width: 2; }
  table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid #e5e7eb; padding: 5px; text-align: right; } th:first-child, td:first-child { text-align: left; }
  pre { background: #f3f4f6; overflow-wrap: anywhere; padding: 10px; white-space: pre-wrap; }
  @media print { .panel, .metric { break-inside: avoid; } .grid-2 { break-inside: avoid; } }
</style>
</head>
<body>
  <header>
    <h1>Vehicle Target Layout Calibration Report</h1>
    <p class="subtitle">Vehicle: ${escapeHtml(input.vehicleName)} (${escapeHtml(input.vehicleId)}) · Capture Angle: ${escapeHtml(formatAngle(input.captureAngle))}</p>
  </header>
  <section class="summary">
    <div class="metric"><span>Dataset Size</span><strong>${input.datasetSize}</strong></div>
    <div class="metric"><span>Accepted Images</span><strong>${input.acceptedImages}</strong></div>
    <div class="metric"><span>Rejected Images</span><strong>${input.rejectedImages}</strong></div>
    <div class="metric"><span>Outliers</span><strong>${input.outlierImages}</strong></div>
    <div class="metric"><span>Average Confidence</span><strong>${input.averageConfidence.toFixed(2)}</strong></div>
    <div class="metric"><span>Average Quality</span><strong>${input.averageQuality.toFixed(2)}</strong></div>
  </section>
  <h2>Position Statistics</h2>
  <div class="grid-2">${statisticsTable('Plate Center', recommendation.plateStatistics)}${statisticsTable('Wheel Center', recommendation.wheelStatistics)}</div>
  <h2>Visual Distribution</h2>
  <div class="grid-2">${scatterPlot(recommendation)}${heatmap(recommendation.plateHeatmap, '#22c55e', 'Plate Heatmap')}</div>
  <div class="grid-2">${heatmap(recommendation.wheelHeatmap, '#2563eb', 'Wheel Heatmap')}<section class="panel"><h3>Expected Vehicle Size</h3><p>Width: ${recommendation.expectedVehicleSize.width.toFixed(4)}</p><p>Height: ${recommendation.expectedVehicleSize.height.toFixed(4)}</p><h3>Recommended Target</h3><p>Plate: x=${recommendation.targetLayout.plate.x.toFixed(4)}, y=${recommendation.targetLayout.plate.y.toFixed(4)}, width=${recommendation.targetLayout.plate.width.toFixed(4)}, height=${recommendation.targetLayout.plate.height.toFixed(4)}, toleranceX=${recommendation.targetLayout.plate.toleranceX.toFixed(4)}, toleranceY=${recommendation.targetLayout.plate.toleranceY.toFixed(4)}</p><p>Wheel: x=${recommendation.targetLayout.wheel.x.toFixed(4)}, y=${recommendation.targetLayout.wheel.y.toFixed(4)}, width=${recommendation.targetLayout.wheel.width.toFixed(4)}, height=${recommendation.targetLayout.wheel.height.toFixed(4)}, toleranceX=${recommendation.targetLayout.wheel.toleranceX.toFixed(4)}, toleranceY=${recommendation.targetLayout.wheel.toleranceY.toFixed(4)}</p></section></div>
  <h2>Reviewed Export Payload</h2>
  <pre>${escapeHtml(JSON.stringify(exportPayload, null, 2))}</pre>
</body>
</html>`;
}
